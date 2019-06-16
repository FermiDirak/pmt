This file documents the mechanisms PMT uses for storing and serialzing repository data.

PMT stores repository information in `.git/pmt`

Currently there should only be one file in `.git/pmt`: stories.json

stories looks like this:

```json
{
  "branchName": {
    "storyName",
    "description": string,
    "tasks": [
      {
        "description": string,
        "commit_hash": string,
      },
      ...
    ],
  }
}
```