# ci/

Files the GitHub workflows use, so a run downloads nothing but Zotero itself.

- `prepare.mjs` -- run after `npm ci` in every job: stops the scaffold's daily
  update check (a rate-limited answer crashed a job) and puts the pinned
  `chai.js` where the test runner looks first.
- `chai.js` -- [Chai](https://www.chaijs.com/) 4.3.8, browser build, MIT
  licence (Copyright (c) 2017 Chai.js Assertion Library), the copy the
  maintainer's local runs use. The runner otherwise fetches the latest one
  from chaijs.com on every run.
