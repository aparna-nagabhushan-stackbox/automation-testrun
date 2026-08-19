---
name: wms-automation-scaffold
description: Generates StackBox WMS test automation code (Java, Selenium 4.23 + Appium 9.3 + REST-Assured 5.5 + TestNG 7.8) that matches the exact conventions of the platform-regression-suite repo — Page Objects, test classes, API builders, DataKeys constants, testdata JSON, and TestNG suite XML — from a plain-English flow description or a test case. Works even in a completely empty repo by bootstrapping the whole framework layer (DriverInit, Generics, Configuration, TestDataLoader, etc.) first. Use this whenever the user asks to "automate this test case", "write automation for X flow", "create a Selenium/Appium/REST-Assured test for...", "scaffold a new WMS automation repo", "add a new page object/test/API builder", or describes any StackBox WMS Web/Mobile/API flow they want turned into a Java test — even if they don't explicitly say "automation", "Page Object", or "TestNG" by name. Also trigger when the user is starting test automation in a brand-new or mostly-empty repo and mentions StackBox, WMS, or wants it to follow "the same repo"/"the same format" as an existing automation project.
---

# WMS Automation Scaffold

Turns a test case or a flow description into working Java test automation code, in the exact
style of `platform-regression-suite`, whether the target repo already has the framework wired up
or is completely empty.

Everything this skill knows about the conventions is bundled here in `references/` — it does not
depend on `platform-regression-suite` being checked out anywhere. Read `references/conventions.md`
before generating anything; it is the source of truth for naming, annotations, logging calls,
PageFactory patterns, data flow, and suite-XML wiring. Do not re-derive these from first principles
or from generic Selenium/TestNG habits — this repo has specific, sometimes unusual conventions
(e.g. no dependency injection for Page Objects, raw `Map` bodies for API calls, a fixed `pause(1)`
after every API call) and matching them exactly is the entire point of this skill.

## Step 0 — figure out where you are

Check whether the current repo already has the framework layer:

```
src/main/java/framework/listeners/DriverInit.java
```

- **Missing** → this is a fresh repo. Go to "Bootstrapping a new repo" below before doing anything else.
- **Present** → the framework already exists. Skip bootstrapping — go straight to "Generating automation
  for a flow", and reuse whatever's already there (existing POs, `DataKeys`, `APIResources`, suite XMLs)
  rather than duplicating it. Read the real files in *this* repo as your primary reference at that point;
  `references/conventions.md` still applies, but the live repo is more authoritative than the bundled copy
  for anything project-specific (URLs, already-automated screens, existing data keys).

## Bootstrapping a new repo

1. Copy `references/bootstrap/pom.xml` to the repo root.
2. Copy everything under `references/bootstrap/framework/` to `src/main/java/framework/` (preserving
   the subfolder structure: `annotations/`, `enums/`, `configurations/`, `commons/`, `init/`, `listeners/`, `utils/`).
3. Copy `references/bootstrap/resources/log4j2.xml` to `src/main/resources/log4j2.xml`.
4. Copy `references/bootstrap/testresources/configurations/{stg,uat}/*.properties` to
   `src/test/resources/configurations/{stg,uat}/`. These files have `REPLACE_WITH_...` placeholders —
   ask the user for the real staging/UAT URLs, credentials, and mobile app details rather than
   inventing values, and fill them in before the suite can actually run.
5. Create empty starter dirs: `src/test/java/tests/`, `src/test/java/pageobjects/web/`,
   `src/test/java/pageobjects/mobile/`, `src/test/java/api/builder/`, `src/test/java/api/constants/`,
   `src/test/java/constants/`, `testdata/`, `test-suites/`.
6. Create `constants/DataKeys.java` and `api/constants/APIResources.java` from
   `references/examples/DataKeys.java` and `references/examples/APIResources.java` (the starter
   versions with just a couple of seed constants — add to these as you generate real automation).
7. Create `testdata/stg.json` and `testdata/uat.json` from `references/examples/testdata.json`
   (identical structure in both — that's enforced by CI in the real repo, keep the habit).
8. Create `test-suites/main.xml` from `references/examples/main.xml`.
9. Tell the user: framework is bootstrapped, but `web.properties`/`api.properties`/`mobile.properties`
   need real values before `mvn clean install -Denv=stg -Dreport=local` will do anything useful.
   Don't try to guess or fetch real staging URLs/credentials yourself.

Read `references/conventions.md`'s "ReportPortal (optional)" and "Known simplifications" sections
and mention them briefly to the user — they may want those features restored, and it's a one-line
decision now versus a bigger retrofit later.

Then continue into "Generating automation for a flow" for whatever test case prompted the bootstrap
in the first place — don't stop at just the skeleton.

## Generating automation for a flow

Given a test case (structured, e.g. from a test-case doc) or a plain-English description
("go to inventory, search for a bin, verify the stock count"), work through this sequence. Skip
steps that don't apply (an API-only flow has no Page Object step; a pure-UI flow has no builder step).

1. **Identify the platform(s)**: Web, Mobile, API, or a mix (a flow that logs in via mobile app OTP
   fetched from a web action needs both, like `LoginTests.TC_004_005` in `references/examples/`).

2. **Page Objects** — for each screen the flow touches:
   - Search `references/examples/` and (if present) the live repo's `src/test/java/pageobjects/**`
     for a Page Object that already covers this screen or something close to it. Reuse/extend rather
     than duplicate — if a `HomeWebPO`-equivalent already exists, don't write a second one.
   - If it's genuinely new, write it following `references/conventions.md`'s "Page Objects" section:
     extend `Generics`, `PageFactory`/`AppiumFieldDecorator` init in the constructor, thin methods that
     `testStepsLog`/`testInfoLog` then do exactly one action or one verification.
   - Any locator you can't verify against a real running app or an existing example gets
     `// TODO-LOCATOR: verify against live app` right next to it. Track every one you write for the
     final report — see "What to report back" below.

3. **API builders** — for each API call the flow needs (including setup/teardown calls like login,
   session reset, or data seeding):
   - Check `references/examples/AuthenticationBuilder.java` and the live repo's `api/builder/**` for
     an existing method first.
   - New methods: `extends Generics`, raw `Map<String,Object>` for headers/body, call through
     `framework.commons.APIActions`, log with `testAPILog`, assert status with `Assert.assertEquals`.
   - New endpoint paths go into `api/constants/APIResources` as named constants, not inline strings.

4. **Test class**:
   - One method per test case, named `TC_<id>_<SCREAMING_SNAKE_DESCRIPTION>`.
   - `@Web` and/or `@Mobile` + `@Test` + `@Attributes` (see conventions.md for whether `@Attributes`
     is load-bearing in this particular repo or just decoration).
   - Pull every data value through `TestDataLoader.getTestData("<module>", "TC_XXX")` +
     a `DataKeys` constant — never a literal.
   - `Assert` from `org.testng.Assert`, nothing else.
   - Add the class to an existing module `*Tests.java` file if one already exists for this module,
     rather than creating a near-duplicate class.

5. **Test data**:
   - Add the `TC_XXX` entry to the right module array in *both* `testdata/stg.json` and
     `testdata/uat.json` (same keys, environment-appropriate values — ask the user for env-specific
     values rather than copying stg's into uat's).
   - Add any new field name to `constants/DataKeys` if it doesn't already exist.

6. **Suite XML**:
   - Add a `<test>` entry (with a human-readable `name` describing the scenario) to the relevant
     module suite XML, or create a new one following `references/examples/login.xml`'s shape if this
     is the first test in a new module.
   - If you created a new suite XML file, add it to `main.xml`'s `<suite-files>` — a suite file that
     isn't listed there never runs.

## What to report back

After generating, summarize for the user:
- Which files were created vs. extended.
- Every `TODO-LOCATOR` placeholder left behind, with the file and what screen/element it's guessing at.
- Any test data values you couldn't infer (e.g. a real UAT branch name) that need a human to fill in.
- Whether the new/extended suite XML is wired into `main.xml` (or which suite file to run directly
  with `-Dsuite.name=<file>.xml` if not).

Don't claim the automation is complete or "ready to run" if there are unresolved `TODO-LOCATOR`
markers or placeholder data values — say clearly what's left before a first real run.

## Reference files

- `references/conventions.md` — the full convention reference (naming, annotations, logging,
  PageFactory, StaleElementReferenceException handling, assertions, data flow, API builders, suite
  XML wiring, RetryCleanup, locator strategy, ReportPortal). Read this fully before generating code
  in a repo you haven't touched yet this session.
- `references/bootstrap/` — copy-as-is framework layer for a brand-new repo (pom.xml + the full
  `framework/` package tree + log4j2.xml + placeholder `.properties` files).
- `references/examples/` — real, working examples pulled from `platform-regression-suite` (login
  Page Objects for web + mobile, an API builder, a test class, `DataKeys`, `APIResources`, suite XML,
  testdata JSON). These are genuine same-product locators/flows, not invented samples — port them
  near-verbatim when the target screen matches, use them as a style reference otherwise.
