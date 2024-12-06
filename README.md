# RimWorld Multiplayer Compatibility Checker

A userscript that adds multiplayer compatibility information directly to Steam Workshop mod pages for RimWorld. The script pulls data from the [RimWorld Multiplayer Compatibility List](https://docs.google.com/spreadsheets/d/1jaDxV8F7bcz4E9zeIRmZGKuaX7d0kvWWq28aKckISaY) and displays it on the mod page.

## Features

- Shows multiplayer compatibility status directly on mod pages
- Automatically detects the correct RimWorld version from mod tags
- Allows setting a default version for compatibility checking
- Caches data locally (refreshes every 24 hours)
- Provides detailed compatibility information including:
    - Compatibility status (Working, Major Issues, Minor Issues, etc.)
    - Additional notes about specific compatibility issues
    - Last time compatibility data was updated

## Installation

1. Install a userscript manager:
    - [Violentmonkey](https://violentmonkey.github.io/) (Recommended)
    - [Tampermonkey](https://www.tampermonkey.net/)
    - [Greasemonkey](https://www.greasespot.net/)

2. Install the script by clicking [here](https://github.com/jakedev796/rimworld-mp-compatibility-checker/raw/refs/heads/master/rimworld-mp-compatibility.user.js) 

## Usage

After installation, the script will automatically:
1. Add a compatibility status indicator to RimWorld mod pages on the Steam Workshop
2. Show detailed compatibility information above the mod description
3. Allow you to check compatibility for different RimWorld versions

### Version Selection
- Use the dropdown menu to check compatibility for different RimWorld versions
- Set a default version by clicking the 📌 button
- Clear the default version by clicking the ❌ button

### Compatibility Status Levels
- ✅ Fully Compatible - All features work correctly in multiplayer
- ⚠️ Minor Issues - Works with some minor features not functioning
- ⚡ Major Issues - Works but has significant features that don't function
- ❌ Does Not Work - Not compatible with multiplayer
- ❓ Untested - Compatibility has not been verified

## Data Source

This script uses data from the [RimWorld Multiplayer Compatibility List](https://docs.google.com/spreadsheets/d/1jaDxV8F7bcz4E9zeIRmZGKuaX7d0kvWWq28aKckISaY), which is actively maintained by the RimWorld multiplayer community.

## Contributing

Feel free to submit issues or pull requests if you find any bugs or have suggestions for improvements.

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Thanks to the RimWorld multiplayer community for maintaining the [compatibility spreadsheet](https://docs.google.com/spreadsheets/d/1jaDxV8F7bcz4E9zeIRmZGKuaX7d0kvWWq28aKckISaY)
- Thanks to the creators and maintainers of the [RimWorld multiplayer mod](https://steamcommunity.com/sharedfiles/filedetails/?id=2606448745)

## Known Issues

- Some mods might show as "Untested" if they're not yet in the compatibility database

## Privacy

This script:
- Only runs on Steam Workshop pages for RimWorld
- Only accesses the public compatibility spreadsheet
- Stores cached data locally in your browser
- Does not collect or transmit any personal information