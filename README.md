# Traildust
Traildust is a command-line tool that helps you understand your Cloudtrail logs.

![The Traildust tool](https://github.com/bnetter/traildust/raw/master/src/images/traildust.gif "The Traildust tool")


# Installation

You need [npm](http://npmjs.org) to use Traildust.

```
npm install -g traildust
```

# Usage

When installed, you can easily start the tool using:

```
traildust
```

The tool will first look for gzipped logs, then will parse all events, then will ask you to filter them before display them.

By default, the tool will suggest to look for log files in the current path. Alternatively, you can specify a path using the `path` parameter:

```
traildust --path=~/logs
```
