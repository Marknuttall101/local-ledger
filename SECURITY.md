# Security

## Reporting an issue

Please report security or privacy issues privately, not in a public issue:

- Use GitHub's **Report a vulnerability** button on the Security tab of this repository, or
- email **contactus@nuttallquantsolutions.com.au**.

Include what you found, how to reproduce it, and what data or behaviour it affects. You'll get an
acknowledgement within five working days.

## Scope

Of most interest are ways the app could send data anywhere other than described in the README's
[Privacy design](README.md#privacy-design) section, for example:

- any statement content, amount, date, account detail or bank wording leaving the browser;
- the OpenRouter key being sent anywhere other than `openrouter.ai`, or being written into a backup;
- a way around the Content-Security-Policy.

The [live demo](https://marknuttall101.github.io/local-ledger/) is a static site with no backend,
so there is no server to test against. Testing it in your own browser is fine. Please don't test
against other people's deployments.
