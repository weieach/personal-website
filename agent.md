# Website preferences

- When asked to reduce a video's scale within its container without an explicit value, use `scale: 0.8`. Keep the container aligned to the project grid. This is the default for future requests; preserve other existing scales unless asked to change them.

- Archive projects have no project detail pages or Project details chips. Their thumbnails must not navigate; an optional Visit site chip may link to the external site.

- Work and Playground projects may also omit a detail page. Mark these cards with `data-project-details="false"`, omit thumbnail navigation and Project details chips, and preserve an optional Visit site chip. Pictogram uses this option.
