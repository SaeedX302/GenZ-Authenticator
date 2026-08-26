# GenZ-Authenticator (based on GenZ-Authenticator)

> Original: GenZ-Authenticator generates 2-Step Verification codes in your browser. [![Build Status](https://travis-ci.com/GenZ-Authenticator/GenZ-Authenticator.svg?branch=dev)](https://travis-ci.com/GenZ-Authenticator/GenZ-Authenticator) [![Crowdin](https://d322cqt584bo4o.cloudfront.net/authenticator-firefox/localized.svg)](https://crowdin.com/project/authenticator-firefox) <img align="right" width="100" height="100" src="https://github.com/GenZ-Authenticator/GenZ-Authenticator/raw/dev/images/icon.svg">

> GenZ-Authenticator generates 2-Step Verification codes in your browser.

## Available for Chrome, Firefox, and Microsoft Edge

[<img src="https://raw.githubusercontent.com/wiki/GenZ-Authenticator/GenZ-Authenticator/readme-images/chrome-web-store.png" title="Chrome Web Store" width="170" height="48" />](https://chrome.google.com/webstore/detail/authenticator/bhghoamapcdpbohphigoooaddinpkbai) [<img src="https://raw.githubusercontent.com/wiki/GenZ-Authenticator/GenZ-Authenticator/readme-images/firefox-add-ons.png" title="Firefox Add-ons" width="170" height="48" />](https://addons.mozilla.org/en-US/firefox/addon/auth-helper?src=external-github) [<img src="https://raw.githubusercontent.com/wiki/GenZ-Authenticator/GenZ-Authenticator/readme-images/microsoft-store.png" title="Microsoft Store" height="48">](https://microsoftedge.microsoft.com/addons/detail/ocglkepbibnalbgmbachknglpdipeoio)


### Safari Edition

A Safari edition of GenZ-Authenticator is available on the App Store. We do not provide official support for the Safari edition.

[<img width="150" alt="Download on the App Store" src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"/>](https://apps.apple.com/us/app/authen/id1602945200?mt=12)

## Features

- **Browser-based 2FA** — Generate TOTP/HOTP codes directly in your browser
- **QR Code Scanning** — Import accounts by scanning QR codes from any webpage
- **E2E Encrypted Cloud Sync** — Sync OTP entries across multiple browsers via Google Drive, Dropbox, or OneDrive. All data is encrypted locally before upload using AES-256-GCM with Argon2id key derivation. Cloud providers never see your secrets. See [SECURITY.md](SECURITY.md) for details.
- **Multiple Algorithms** — SHA-1, SHA-256, SHA-512, GOST R 34.11-2012
- **Battle.net & Steam Guard** — Native support for gaming platform authenticators
- **Encrypted Local Storage** — Optional master password protection with Argon2id + AES encryption
- **Import/Export** — JSON backup, otpauth:// URI, Google Authenticator migration

## Build Setup

``` bash
# install development dependencies
npm install
# compile
npm run [chrome, firefox, prod]
```

To reproduce a build:

``` bash
npm ci
npm run prod
```

To reproduce a build for Safari, please follow contribution guidance in [GenZ-Authenticator/Authen](https://github.com/GenZ-Authenticator/Authen#how-to-contribute)

## Development (Chrome)

``` bash
# install development dependencies
npm install
# compiles the Chrome extension to the `./test/chrome` directory
npm run dev:chrome
# load the unpacked extension from the `./test/chrome/ directory in Chrome
```

Note that Windows users should download a tool like [Git Bash](https://git-scm.com/download/win) or [Cygwin](http://cygwin.com/) to build.

## Acknowledgment

We would like to extend our heartfelt thanks to Laurent, the Chief Information Security Officer (CISO) of the University of Luxembourg, for the invaluable support and contribution to this project. During the development process, the CISO team provided critical security recommendations that helped us identify and address potential vulnerabilities, significantly enhancing the security and reliability of the project.

We especially want to acknowledge the University of Luxembourg's information security team for their selfless contribution, which not only facilitated the progress of this project but also had a positive impact on the broader open-source community. We recognize that the success of open-source software depends heavily on collaboration and support from various stakeholders, and the involvement of the University of Luxembourg has allowed us to offer a more secure and dependable product to a wider audience.

We understand that while open-source software is free, maintaining and improving these projects requires significant resources. The University of Luxembourg’s information security team has demonstrated their strong commitment to the open-source community, contributing not just within their university but to users and developers globally. We hope this acknowledgment will help them continue to secure the support and resources necessary to further advance open-source initiatives.

Once again, we express our sincere gratitude to the University of Luxembourg's CISO team for their valuable advice and assistance.
