# Public documentation TODO

This page tracks documentation and transparency items that we have intentionally deferred. We think owning gaps publicly is part of how we build trust, so this list is meant to be honest about what is missing rather than aspirational.

## Planned

### Accuracy benchmarks

We plan to publish precision, recall, and F1 scores for each PII type and each supported provider, along with the methodology, the synthetic dataset used, and the reproduction commands. This is deferred until the detection engine is stable enough that the numbers are meaningful and reproducible across releases. Publishing unstable numbers would be worse than publishing none.

Target: before the first public 1.0 release.

## Under consideration

- Third-party security audit summary, once an audit has been completed.
- Reproducible build instructions, if and when source code is opened.
- Translations of key documentation (privacy policy, threat model, FAQ) into additional languages.
- A public roadmap covering the next two or three releases.
- Annual transparency report covering issues received, fixes shipped, and any law enforcement requests (we expect zero, given that we hold no user data).

## Not planned

- Server-side analytics or telemetry of any kind. There is nothing to publish numbers about because we do not collect anything.
- A public bug bounty program with monetary rewards. We will revisit this once the project has the funding to support it responsibly.
