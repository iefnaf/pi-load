# pi-load

[![npm version](https://img.shields.io/npm/v/@alexlikevibe/pi-load.svg)](https://www.npmjs.com/package/@alexlikevibe/pi-load) [![GitHub](https://img.shields.io/badge/GitHub-iefnaf%2Fpi--load-blue)](https://github.com/iefnaf/pi-load)

A [pi](https://pi.dev) extension that adds a `/load` command for resuming shared sessions.

## What it does

pi's `/share` command exports your session to a secret GitHub Gist and gives you two URLs:

- `https://pi.dev/session/#<id>` — viewer link
- `https://gist.github.com/<user>/<id>` — direct Gist link

With pi-load installed, the recipient can run `/load <url>` to resume the conversation
from where it left off.

## Requirements

- [GitHub CLI](https://cli.github.com/) installed and logged in (`gh auth login`)

## Installation

    pi install @alexlikevibe/pi-load

Or add directly to your pi config.

## Usage

    /load https://pi.dev/session/#55817e280d94c4caefdbbf07bd539fca
    /load https://gist.github.com/alice/55817e280d94c4caefdbbf07bd539fca

The current session is replaced with the loaded one. Your local working directory
is used as the session cwd (the sender's path is not preserved).

## Notes

- Requires `gh` to be installed and authenticated (`gh auth login`)
- Only works with sessions shared via pi's built-in `/share` command
- `systemPrompt` and `tools` are regenerated from your own pi configuration
