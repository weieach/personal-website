# Website preferences

- When asked to reduce a video's scale within its container without an explicit value, use `scale: 0.8`. Keep the container aligned to the project grid. This is the default for future requests; preserve other existing scales unless asked to change them.

- Archive projects have no project detail pages or Project details chips. Their thumbnails must not navigate; an optional Visit site chip may link to the external site.

- Work and Playground projects may also omit a detail page. Mark these cards with `data-project-details="false"`, omit thumbnail navigation and Project details chips, and preserve an optional Visit site chip. Pictogram uses this option.

- For unfinished Work or Playground projects, add `data-project-status="in-development"` to the `.card`. This replaces the Project details chip with an accessible “In development” button that shows a toast, including on mobile, and removes thumbnail navigation while preserving optional Visit site links. It also works with `data-project-details="false"`. Remove the status to restore the card's normal details behavior; Archive cards never show a details/status chip. MitWerk and Job Tracker currently use this status.

- In-development chips use gray italic text and an icon-sized clipped loading animation with three quadrilaterals of equal size and color. Alternate their entry directions and stagger their timing so they do not settle on a shared row. Include moments when all three are visible; the middle must never disappear while both outer blocks are visible. Respect reduced-motion preferences with a static icon.
