# PII types

This page lists every kind of sensitive information PromptGnome can detect, what tier it belongs to, and the placeholder format used when auto-anonymize is in effect.

## Free tier

Free-tier detections run entirely on regular expressions and structural validation. They are fast, deterministic, and run on every supported message.

| Type | Example placeholder | Description |
|---|---|---|
| Email address | `[EMAIL_1]` | Standard email addresses |
| Social Security Number | `[SSN_1]` | US Social Security Numbers, validated against known invalid patterns |
| Credit card number | `[CREDIT_CARD_1]` | Major card formats, validated with the Luhn algorithm |
| US phone number | `[PHONE_1]` | Common US phone formats including with and without country code |
| International phone number | `[PHONE_1]` | E.164 and common international formats |
| IPv4 address | `[IP_1]` | Standard IPv4 addresses |
| IPv6 address | `[IP_1]` | Standard IPv6 addresses |
| AWS access key | `[API_KEY_1]` | AWS access key ID format |
| AWS secret key | `[API_KEY_1]` | AWS secret key format |
| GitHub token | `[API_KEY_1]` | Personal access tokens, fine-grained tokens, and app tokens |
| Stripe API key | `[API_KEY_1]` | Stripe live and test keys |
| Generic API key or secret | `[API_KEY_1]` | High-entropy strings that match common API key patterns |
| IBAN | `[IBAN_1]` | International Bank Account Number format |
| US passport number | `[PASSPORT_1]` | US passport numbering format |
| Driver's license number | `[LICENSE_1]` | Common state license formats |
| ZIP code | `[ZIP_1]` | US ZIP and ZIP+4 codes (with context awareness) |
| Date of birth | `[DOB_1]` | Common date formats appearing near indicative phrases like "DOB" or "born" |
| Street address | `[ADDRESS_1]` | Multi-line street addresses |

## Pro tier

Pro-tier detections use a small on-device machine learning model in addition to regular expressions. They handle entities that cannot be reliably detected with patterns alone.

| Type | Example placeholder | Description |
|---|---|---|
| Person name | `[NAME_1]` | First names, last names, and full names |
| Organization | `[COMPANY_1]` | Company, institution, and organization names |
| Location | `[LOCATION_1]` | Cities, regions, countries, and other place names |
| Medical condition | `[MEDICAL_1]` | Names of medical conditions, treatments, and clinical terms |

## How placeholders are numbered

Placeholders are numbered sequentially within a session, starting at 1. The same entity always maps to the same placeholder within the same session, so a name that appears multiple times in a conversation gets a single consistent placeholder rather than a new one each time.

For example, in a conversation that mentions "Jane Smith" twice and "Acme Corporation" once, the anonymized version would use `[NAME_1]` for both occurrences of Jane Smith and `[COMPANY_1]` for Acme Corporation.

When the AI replies, PromptGnome reverses this mapping inside your browser so you see the original values in the response on your screen, while the AI provider only ever saw the placeholders.

## Customizing detection

Each detection type can be turned on or off individually in the side panel settings. You can also adjust the confidence threshold at which a detection triggers a warning, and (for Pro users) the higher threshold at which auto-anonymize takes effect.

## Reporting missed or incorrect detections

If PromptGnome flags something that is not actually sensitive, please file a [false positive issue](https://github.com/effyyy/PromptGnome/issues/new/choose). If it misses something it should have caught, please file a [false negative issue](https://github.com/effyyy/PromptGnome/issues/new/choose).

In both cases, please use synthetic example data only. Never include real personal information in an issue.
