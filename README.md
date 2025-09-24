# GTD-Obsidian

This project aims to combine the GTD (Getting Things Done) methodology with the Obsidian note-taking tool to help users efficiently manage tasks and knowledge. By using structured notes and task management workflows, it enhances personal productivity.

## Main Features

- Task collection and organization based on Obsidian
- Synchronize OmniFocus task data
- Task completion status in OmniFocus is reflected back to OmniFocus
- Provide RESTful API for open access and requests to GTD data
- **Timeline View**: Display daily tasks in a visual timeline format using `timeline` code blocks

## Timeline Feature

The timeline feature allows you to create visual time-based task displays in your Obsidian notes.

### Usage

Create a `timeline` code block with your tasks:

```timeline
- [ ] Morning meeting @9:00
- [ ] Check emails @9:30
- [x] Complete report @10:30
- [ ] Client call @2:30 PM
- [ ] Team meeting @下午3点30分
- [ ] Code review @17:00
```

### Supported Time Formats

- **24-hour format**: `@14:30`, `@9:00`
- **12-hour format**: `@2:30 PM`, `@9:00 AM`
- **Chinese time**: `@下午2点30分`, `@上午9点`, `@晚上8点`
- **Relative time**: `@30分钟后`, `@in 1 hour`

### Task Status

- `[ ]` - Pending task
- `[x]` - Completed task

### Visual Indicators

- **Blue dot**: Upcoming tasks
- **Yellow dot**: Current time tasks (with pulse effect)
- **Gray dot**: Past time tasks
- **Green dot**: Completed tasks

## Target Audience

Ideal for individuals or teams looking to improve time management and task execution efficiency, especially Obsidian users.

## Quick Start

1. Clone this repository into your local Obsidian Vault directory
2. Configure templates and plugins according to the documentation
3. Start your GTD journey!
