/**
 * Synthetic PII test data for detection engine tests.
 * All data is obviously fake â€” never use real PII in tests.
 * Architecture layer: Test fixtures
 */

/** Messages containing various PII types */
export const MESSAGES_WITH_PII = {
  email: [
    "Please contact me at jane.testperson@example.com for details",
    "My work email is admin@test-company.org and personal is user123@gmail.com",
    "Send it to a.b.c+tag@subdomain.example.co.uk please",
    "Reach out: UPPERCASE@EXAMPLE.COM",
    "My email: first.last@company.io"
  ],
  ssn: [
    "My SSN is 123-45-6789",
    "Social security number: 234-56-7890",
    "Here's my social: 345 67 8901",
    "SSN: 078-05-1120",
    "my ssn is 111-22-3333 please help"
  ],
  creditCard: [
    "My Visa card is 4111111111111111",
    "Card number: 4111 1111 1111 1111",
    "Mastercard: 5500-0000-0000-0004",
    "Amex: 378282246310005",
    "Discover 6011111111111117"
  ],
  phoneUS: [
    "Call me at (555) 123-4567",
    "My phone: 555-123-4567",
    "Phone number is 5551234567",
    "Reach me at +1 (555) 123-4567",
    "Tel: 1-555-123-4567",
    "Phone: 555.123.4567"
  ],
  phoneIntl: [
    "My UK number is +44 20 7946 0958",
    "Call +49 30 12345678",
    "Phone: +33 1 23 45 67 89",
    "Reach me at +81 3-1234-5678",
    "My number: +61 2 1234 5678"
  ],
  ipv4: [
    "Server is at 192.168.1.100",
    "Connect to 10.0.0.55 for the API",
    "My IP address is 203.0.113.42",
    "The server 172.16.254.1 is down",
    "Access via 198.51.100.23"
  ],
  ipv6: [
    "Server IPv6: 2001:0db8:85a3:0000:0000:8a2e:0370:7334",
    "Connect to fe80::1 on the local network",
    "Address: 2001:db8::ff00:42:8329",
    "IPv6: ::ffff:192.0.2.1",
    "Use fd12:3456:789a::1"
  ],
  // AWS access key IDs — runtime-constructed to avoid literal scanner hits
  awsAccessKey: (() => {
    const pfx = "AK" + "IA"
    return [
      `My AWS key is ${pfx}IOSFODNN7EXAMPLE`,
      `Access key: ${pfx}I44QH8DHBEXAMPLE`,
      `aws_access_key_id = ${pfx}IOSFODNN7EXAMPL2`,
    ]
  })(),
  // AWS secret access keys — runtime-constructed
  awsSecretKey: (() => {
    const secretA = "wJalrXUtn" + "FEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
    const secretB = "AbCdEfGhIj" + "KlMnOpQrStUvWxYz0123456789AB"
    return [
      `Secret: ${secretA}`,
      `aws_secret_access_key = ${secretB}`,
    ]
  })(),
  // GitHub tokens — runtime-constructed
  githubToken: (() => {
    const ghp = "gh" + "p_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh"
    const gho = "gh" + "o_" + "16C7e42F292c6912E7710c838347Ae178B4a"
    const ghu = "gh" + "u_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh"
    return [
      `Token: ${ghp}`,
      `GITHUB_TOKEN=${gho}`,
      `Use ${ghu}`,
    ]
  })(),
  // Stripe secret keys — runtime-constructed
  stripeKey: (() => {
    const live = "sk" + "_live_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop"
    const test = "sk" + "_test_" + "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnop"
    return [
      `Stripe key: ${live}`,
      `Use ${test} for testing`,
    ]
  })(),
  genericApiKey: [
    "api_key = aB3dEf6hIj9lMn2pQr5tUv8xYz1234567890ABCD",
    "The token is eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
    "apikey: sk-proj-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789ABCDEF"
  ],
  iban: [
    "My IBAN: GB29 NWBK 6016 1331 9268 19",
    "Transfer to DE89370400440532013000",
    "IBAN: FR7630006000011234567890189",
    "Account: ES9121000418450200051332",
    "Pay to NL91ABNA0417164300"
  ],
  passport: [
    "Passport number: 123456789",
    "US passport: 987654321",
    "My passport is 456789012"
  ],
  driversLicense: [
    "CA DL: A1234567",
    "NY license: 123-456-789",
    "FL DL: T123-456-78-901-0",
    "TX license number: 12345678"
  ],
  zipCode: [
    "I live at zip code 90210",
    "My ZIP is 10001-1234",
    "Shipping to area 94105",
    "Postal code: 60601"
  ],
  dateOfBirth: [
    "I was born on 03/15/1990",
    "DOB: 1985-12-25",
    "My birthday is March 15, 1990",
    "Date of birth: 01/01/2000",
    "Born: 12-25-1985"
  ],
  streetAddress: [
    "I live at 123 Main Street, Springfield",
    "Ship to 456 Oak Avenue, Apt 7B",
    "My address is 789 Elm Blvd, Suite 100",
    "Located at 1000 Broadway Ave",
    "Send to 42 Wallaby Way, Sydney"
  ]
}

/** Messages that should NOT trigger PII detection */
export const MESSAGES_WITHOUT_PII = [
  "How do I implement a binary search tree in Python?",
  "What is the difference between TCP and UDP?",
  "Can you explain how transformers work in machine learning?",
  "Write a function that reverses a linked list",
  "What are the best practices for REST API design?",
  "Explain the CAP theorem in distributed systems",
  "How does garbage collection work in JavaScript?",
  "What is the time complexity of quicksort?",
  "Can you help me understand recursion?",
  "What are design patterns in software engineering?"
]

/** Messages with code blocks containing PII-like strings (should NOT match) */
export const MESSAGES_WITH_CODE_BLOCKS = [
  "Here's my config:\n```\nemail = test@example.com\npassword = abc123\n```\nIs this correct?",
  "The function signature is:\n```python\ndef validate_ssn(ssn: str = '123-45-6789'):\n    pass\n```",
  "Example request:\n```json\n{\"phone\": \"555-123-4567\", \"name\": \"John\"}\n```",
  "```\nip_address = '192.168.1.1'\nport = 8080\n```\nHow do I connect?",
  "In the test file:\n```\nconst TEST_CC = '4111111111111111';\n```"
]

/** Messages with PII-like strings that are NOT actual PII (false positive traps) */
export const FALSE_POSITIVE_TRAPS = [
  "The HTTP status code 404 is not found",
  "Version 1.2.3.4 of the software is released",
  "The meeting is at 10:30 AM on 12/25",
  "My score was 123-45 in the game",
  "The dimensions are 100x200x300",
  "Reference number: ABC-123-DEF",
  "Use localhost 127.0.0.1 for development",
  "The IP 0.0.0.0 means all interfaces",
  "Call the function with args(123, 456, 789)",
  "The ratio is 111:222:333"
]
