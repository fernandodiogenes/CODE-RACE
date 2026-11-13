# CODE RACE — NEON CITY for macOS

The desktop application uses Electron to launch the complete prototype in a maximized window.

The game files, 3D models, question banks, and Three.js library are included in the packaged application. It does not start a local server and does not require an internet connection to load these resources.

## Development prerequisites

- macOS.
- Node.js LTS and npm.
- Internet access during dependency installation and the first Electron Builder build.

The current macOS build is configured for **Apple Silicon (ARM64)**, including M1, M2, M3, and M4 Macs.

These prerequisites are only required for development and packaging. Players do not need Node.js, npm, VS Code, or a server to install and run the game.

## Commands

Run the following commands from the project root:

```sh
npm ci
npm run dev
npm run test:desktop
npm run build:mac
```

- `npm run dev` launches the Electron application in development mode.
- `npm run test:desktop` runs the desktop smoke test, including application startup, 3D initialization, persistence, and basic gameplay.
- `npm run build:mac` generates the macOS application package and disk image.

Build artifacts are saved to:

```text
dist/neon-city/
```

The build generates:

- A macOS application bundle (`.app`).
- A disk image (`.dmg`) for distribution.

## Installation and security

Open the generated `.dmg` file, then drag the `CODE RACE — NEON CITY.app` application into the Applications folder.

The application is currently unsigned and has not been notarized with Apple. macOS Gatekeeper may display a security warning when opening the application, especially when it is downloaded from the internet.

A Developer ID certificate and Apple notarization are recommended for smoother distribution outside the development environment.

## Data and offline execution

Saved progress is stored in `localStorage` within Electron's persistent user profile, under the application's user data directory. It is not stored inside the application bundle.

Three.js and its addons are imported from the local dependency included in the package. The prototype's models, textures, images, and question banks are also packaged.

The build excludes reference folders, automated tests, and question audit files.

The prototype currently displays a placeholder for the lore video. The file `assets/intro/video/neon-city-lore.mp4` is not included in the project. Its absence does not prevent the game from running or require an external connection.

## macOS verification

After generating the build, install and run the application on an Apple Silicon Mac.

Verify the following:

- Application startup.
- 3D city and character rendering.
- Question loading.
- Modal behavior and scrolling.
- Hacks and global events.
- Saving and reopening a game.
- Application shutdown.

Building successfully does not replace testing the packaged application on a native macOS environment.