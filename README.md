# Claude Usage Time Bar

A Chrome extension that adds visual time progression bars to the Claude usage page, allowing you to see at a glance how much of your session and weekly windows have elapsed.

## Features

- **Session Usage Bar**: Displays how much of your 5-hour session window has elapsed
- **Weekly Usage Bars**: Shows progress for "All models" and "Sonnet only" weekly limits
- **Real-time Updates**: Automatically updates every minute and refreshes when usage data changes
- **Visual Clarity**: Progress bars display both percentage and elapsed time in human-readable format
- **Responsive Design**: Integrates seamlessly with Claude's existing UI

## Installation

1. Clone this repository or download the files
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" using the toggle in the top right
4. Click "Load unpacked" and select this project directory
5. The extension will appear in your Chrome toolbar

## Usage

Once installed, navigate to [https://claude.ai/settings/usage](https://claude.ai/settings/usage) and the time bars will automatically appear below each usage metric.

The extension shows:
- **Time elapsed** as a human-readable duration (e.g., "2h 30m elapsed" or "3d 5h elapsed")
- **Progress bar** indicating percentage of the window consumed
- **Percentage** displayed numerically

## Screenshot

![Claude Usage Time Bar Extension in action](screenshot.png)

## How It Works

The extension:
1. Monitors the Claude usage page for usage bars
2. Parses reset time information (e.g., "Resets in 2h 30m" or "Resets Sat 8:59 AM")
3. Calculates the elapsed time based on the reset time
4. Displays a visual progress bar with the calculated percentage
5. Updates every 60 seconds and when the DOM changes (detecting new usage data)

## Technical Details

- **Manifest Version**: 3
- **Target URLs**: `https://claude.ai/settings/usage*`
- **Content Script**: `content.js` (injects and manages time bars)
- **Update Interval**: 60 seconds

## License

This project is provided as-is for personal use.
