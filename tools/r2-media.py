#!/usr/bin/env python3
"""Upload only referenced portfolio media to R2; activate only verified public URLs.

Requires Python 3.9+. Upload additionally requires AWS CLI v2 and an R2 profile.
Credentials are read by AWS CLI, never written into website files.
"""
import argparse
from contextlib import contextmanager, nullcontext
import hashlib
import ipaddress
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import sys
from html.parser import HTMLParser
from urllib.parse import quote, unquote, urlsplit
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'media-config.js'
PLAN = ROOT / '.media-upload-manifest.json'
MIME = {'.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.webp': 'image/webp'}
VERIFY_HEADERS = {
    # Cloudflare Browser Integrity Check rejects Python's default User-Agent.
    # Identify our verifier explicitly while using compatible HTTP headers.
    'User-Agent': 'Mozilla/5.0 (compatible; NCWeiMediaVerifier/1.0; +https://www.ncwei.com)',
    'Origin': 'https://www.ncwei.com',
    'Referer': 'https://www.ncwei.com/',
}


def aws_binary():
    """Prefer AWS's self-contained user install over a Homebrew Python wrapper."""
    override = os.environ.get('NCWEI_AWS_CLI')
    if override:
        binary = shutil.which(os.path.expanduser(override))
        if not binary:
            raise ValueError('NCWEI_AWS_CLI does not point to an executable AWS CLI.')
        return binary
    official = Path.home() / '.local/bin/aws'
    if official.is_file() and os.access(official, os.X_OK):
        return str(official)
    binary = shutil.which('aws')
    if not binary:
        raise ValueError('Install AWS CLI v2 using the official installer described in tools/MEDIA.md.')
    return binary


class MediaReferences(HTMLParser):
    def __init__(self):
        super().__init__()
        self.paths = set()

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag not in ('img', 'video', 'source'):
            return
        for name in ('data-media-src', 'data-media-srcset'):
            value = attrs.get(name, '')
            candidates = [part.strip().split()[0] for part in value.split(',') if part.strip()] if name.endswith('srcset') else [value]
            for value in candidates:
                parsed = urlsplit(value)
                if parsed.scheme or parsed.netloc or not parsed.path.startswith('assets/'):
                    continue
                path = unquote(parsed.path)
                if not (ROOT / path).resolve().is_relative_to((ROOT / 'assets').resolve()):
                    raise ValueError('Media path escapes assets: ' + path)
                self.paths.add(path)


def inventory():
    parser = MediaReferences()
    for page in sorted(ROOT.glob('*.html')):
        parser.feed(page.read_text())
    entries = []
    for path in sorted(parser.paths):
        file = ROOT / path
        if not file.is_file():
            raise ValueError('Referenced file is missing: ' + path)
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(block)
        sha = digest.hexdigest()
        entries.append({'path': path, 'key': f'media/{sha[:20]}/{file.name}',
                        'bytes': file.stat().st_size, 'sha256': sha,
                        'contentType': MIME.get(file.suffix.lower()) or mimetypes.guess_type(path)[0] or 'application/octet-stream'})
    if not entries:
        raise ValueError('No managed media found.')
    return entries


def write_plan(entries):
    PLAN.write_text(json.dumps(entries, indent=2, ensure_ascii=False) + '\n')
    print(f'{len(entries)} referenced files, {sum(e["bytes"] for e in entries) / 1024**3:.2f} GiB.')
    print('Upload plan: .media-upload-manifest.json (ignored by Git).')
    print('Posters, icons, scripts, fonts and unreferenced originals stay local.')


def base_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Use a public HTTPS media URL, without credentials, query or fragment.')
    if parsed.hostname.endswith('.r2.cloudflarestorage.com'):
        raise ValueError('Use the PUBLIC custom domain, not the authenticated S3 API endpoint.')
    return value.rstrip('/')


@contextmanager
def public_dns(base):
    """Resolve this one public media host via HTTPS, for this process only.

    The HTTP hostname and TLS certificate verification remain unchanged.
    No system resolver settings or hosts files are modified.
    """
    host = urlsplit(base).hostname
    request = Request('https://dns.google/resolve?name=' + quote(host, safe='') + '&type=A',
                      headers={'User-Agent': VERIFY_HEADERS['User-Agent']})
    with urlopen(request, timeout=15) as response:
        answer = json.load(response)
    addresses = [str(ipaddress.IPv4Address(record['data']))
                 for record in answer.get('Answer', []) if record.get('type') == 1]
    if answer.get('Status') != 0 or not addresses:
        raise ValueError(f'Public DNS could not resolve {host}. Site configuration was NOT changed.')
    original = socket.getaddrinfo

    def resolve(name, port, *args, **kwargs):
        if name == host:
            return [result for address in addresses
                    for result in original(address, port, *args, **kwargs)]
        return original(name, port, *args, **kwargs)

    print(f'Using public DNS for {host} for this verification only.', flush=True)
    socket.getaddrinfo = resolve
    try:
        yield
    finally:
        socket.getaddrinfo = original


def verify(entries, base):
    failures = []
    missing = []
    for entry in entries:
        url = base + '/' + quote(entry['key'], safe='/')
        try:
            with urlopen(Request(url, method='HEAD', headers=VERIFY_HEADERS), timeout=30) as response:
                if int(response.headers.get('Content-Length', '-1')) != entry['bytes']:
                    raise ValueError('Content-Length differs from local file')
                if response.headers.get_content_type() != entry['contentType']:
                    raise ValueError('Content-Type differs from expected media type')
                if response.headers.get('Access-Control-Allow-Origin') not in ('*', 'https://www.ncwei.com'):
                    raise ValueError('CORS must allow https://www.ncwei.com for canvas rendering')
            if entry['contentType'].startswith('video/'):
                with urlopen(Request(url, headers={**VERIFY_HEADERS, 'Range': 'bytes=0-0'}), timeout=30) as response:
                    if response.status != 206 or response.headers.get('Content-Range') != f'bytes 0-0/{entry["bytes"]}':
                        raise ValueError('Video byte-range requests are not working')
                    response.read(1)
        except HTTPError as error:
            if error.code == 403:
                ray = error.headers.get('CF-Ray', 'unavailable')
                error.close()
                raise ValueError(
                    f'Public media access was forbidden (HTTP 403): {url}\n'
                    f'Cloudflare Ray ID: {ray}. Check Security Events for this request '
                    'and confirm the R2 custom domain has access Enabled.\n'
                    'Site configuration was NOT changed.'
                ) from error
            if error.code == 404:
                missing.append(entry['path'])
            else:
                failures.append(f'{entry["path"]}: HTTP {error.code} {error.reason}')
            error.close()
        except URLError as error:
            if isinstance(error.reason, socket.gaierror):
                host = urlsplit(base).hostname
                raise ValueError(
                    f'Cannot resolve the public media domain "{host}".\n'
                    'In Cloudflare, open R2 > your bucket > Settings > Custom Domains.\n'
                    f'Connect {host} and wait until its status is Active. '
                    'If it is already Active, check DNS propagation and your network.\n'
                    'If public DNS works but local DNS does not, retry with --public-dns.\n'
                    'Then rerun activate with the exact connected HTTPS domain.\n'
                    'Site configuration was NOT changed. This error does not establish whether upload succeeded.'
                ) from error
            failures.append(f'{entry["path"]}: {error}')
        except Exception as error:
            failures.append(f'{entry["path"]}: {error}')
    if missing or failures:
        details = []
        if missing:
            details.append(
                f'{len(missing)} of {len(entries)} referenced files returned HTTP 404.\n'
                'Complete the upload command first and wait for "Upload finished". '
                'If upload already succeeded, confirm this custom domain is connected '
                'to the same bucket used by --bucket.\n'
                'Example missing files:\n' + '\n'.join(missing[:5])
            )
        if failures:
            details.append(f'{len(failures)} other verification failures:\n' + '\n'.join(failures[:5]))
        raise ValueError('Public verification failed; site configuration was NOT changed:\n' + '\n'.join(details))
    print(f'Verified {len(entries)} public files: lengths, types, CORS, and video byte ranges.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('plan', help='List and fingerprint referenced media without contacting Cloudflare')
    configure = commands.add_parser('configure', help='Enter R2 credentials locally using the same CLI as upload')
    configure.add_argument('--profile', default='ncwei-r2')
    upload = commands.add_parser('upload', help='Upload fingerprinted media using an existing R2 AWS profile')
    upload.add_argument('--bucket', required=True)
    upload.add_argument('--account-id', required=True)
    upload.add_argument('--profile', default='ncwei-r2')
    for name in ('verify', 'activate'):
        command = commands.add_parser(name, help='Verify the public files' + (' and enable CDN URLs' if name == 'activate' else ''))
        command.add_argument('--base-url', required=True)
        command.add_argument('--public-dns', action='store_true',
                             help='Use Google public DNS over HTTPS for the media host during verification only')
    commands.add_parser('local', help='Switch back to local assets without deleting cloud files')
    args = parser.parse_args()
    if args.command == 'configure':
        print('Enter the R2 Access Key ID and Secret Access Key in this terminal.\n'
              'Use auto for region and json for output format. Credentials stay outside the repository.', flush=True)
        subprocess.run([aws_binary(), 'configure', '--profile', args.profile], check=True)
        return
    if args.command == 'local':
        CONFIG.write_text('// Local media mode. R2 objects are unchanged.\nwindow.SiteMediaConfig = { baseUrl: "", assets: {} };\n')
        print('Local media enabled.')
        return
    entries = inventory()
    write_plan(entries)
    if args.command == 'plan':
        for entry in sorted(entries, key=lambda e: e['bytes'], reverse=True)[:10]:
            print(f'{entry["bytes"] / 1024**2:6.1f} MiB  {entry["path"]}')
    elif args.command == 'upload':
        binary = aws_binary()
        if not re.fullmatch(r'[a-fA-F0-9]{32}', args.account_id):
            raise ValueError('Expected the 32-character Cloudflare account ID.')
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', args.bucket):
            raise ValueError('Invalid R2 bucket name.')
        aws = [binary, '--profile', args.profile, '--endpoint-url', f'https://{args.account_id}.r2.cloudflarestorage.com', '--region', 'auto']
        env = dict(os.environ, AWS_PAGER='', AWS_REQUEST_CHECKSUM_CALCULATION='when_required', AWS_RESPONSE_CHECKSUM_VALIDATION='when_required')
        profiles = subprocess.run([binary, 'configure', 'list-profiles'], capture_output=True, text=True, env=env)
        if profiles.returncode:
            raise ValueError('AWS CLI could not start. Use the official AWS CLI installer in tools/MEDIA.md.\n' + profiles.stderr.strip())
        if args.profile not in profiles.stdout.splitlines():
            raise ValueError(f'R2 profile "{args.profile}" has not been configured.\n'
                             f'Run: python3 tools/r2-media.py configure --profile {args.profile}\n'
                             'Then retry upload. No files were uploaded.')
        print(f'Using AWS CLI: {binary}', flush=True)
        for index, entry in enumerate(entries, 1):
            print(f'[{index}/{len(entries)}] {entry["path"]}', flush=True)
            # Content-addressed keys allow long caching and safe retries; no delete operation.
            subprocess.run(aws + ['s3', 'cp', str(ROOT / entry['path']), f's3://{args.bucket}/{entry["key"]}',
                                  '--content-type', entry['contentType'], '--cache-control', 'public,max-age=31536000,immutable',
                                  '--metadata', 'sha256=' + entry['sha256'], '--no-progress', '--only-show-errors'], check=True, env=env)
        print('Upload finished. Run activate with the public media domain after setting CORS.')
    elif args.command in ('verify', 'activate'):
        base = base_url(args.base_url)
        with public_dns(base) if args.public_dns else nullcontext():
            verify(entries, base)
        if args.command == 'activate':
            config = {'baseUrl': base, 'assets': {entry['path']: entry['key'] for entry in entries}}
            temporary = CONFIG.with_suffix('.js.tmp')
            temporary.write_text('// Verified R2 media. Generated by tools/r2-media.py activate.\nwindow.SiteMediaConfig = ' + json.dumps(config, ensure_ascii=False, indent=2) + ';\n')
            temporary.replace(CONFIG)
            print('R2 enabled in media-config.js. Preview, then deploy the website changes.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
