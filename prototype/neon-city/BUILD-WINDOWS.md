# CODE RACE — NEON CITY for Windows

The desktop application uses Electron to launch the complete prototype in a maximized window.

The game files, 3D models, question banks, and Three.js library are included in the packaged application. It does not start a local server and does not require an internet connection to load these resources.

## Development prerequisites

- Node.js LTS and npm.
- Windows 10/11 (64-bit) for native validation. The package can also be built on macOS using Electron Builder.
- Internet access during dependency installation and the first Electron Builder build, as it downloads the Electron runtime and packaging tools.

These prerequisites are only required for development and packaging. Players do not need Node.js, npm, VS Code, or a server to install and run the game.

## Commands

Run the following commands from the project root:

```sh
npm ci
npm run dev
npm run test:desktop
npm run build:win:installer
npm run build:win:portable
```

- `npm run dev` launches the Electron application in development mode.
- `npm run test:desktop` runs the desktop smoke test, including 3D initialization, persistence, basic gameplay, and the presentation and dismissal of a global event.
- `npm run build:win` generates both Windows x64 targets.

The NSIS installer and portable executable are saved to `dist/neon-city/`:

- `CODE-RACE-NEON-CITY-1.0.0-win-x64-setup.exe`
- `CODE-RACE-NEON-CITY-1.0.0-win-x64-portable.exe`

The installer is configured for per-user installation, with shortcuts on the Desktop and in the Start Menu.

The application is unsigned because no code-signing certificate is configured. Windows may display its standard warning for unsigned applications.

Since the project does not provide an application icon, Electron Builder uses the default Electron icon.

## Data and offline execution

Saved progress is stored in `localStorage` within Electron's persistent user profile, under the application's user data directory. It is not stored inside the installation folder.

Three.js and its addons are imported from the local dependency included in the package. The prototype's models, textures, images, and question banks are also packaged.

The build excludes reference folders, automated tests, and question audit files.

The prototype currently displays a placeholder for the lore video. The file `assets/intro/video/neon-city-lore.mp4` is not included in the project. Its absence does not prevent the game from running or require an external connection.

## Windows verification

After generating the installer, install and run it on a Windows computer without Node.js or VS Code.

Verify the following:

- 3D city loading.
- Character rendering.
- Question loading.
- Modal behavior and scrolling.
- Hacks and global events.
- Saving and reopening a game.
- Application shutdown using the Close button.

A build generated on another operating system does not replace native Windows testing.