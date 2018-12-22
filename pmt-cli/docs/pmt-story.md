pmt-story(1) -- create a story branch
=====================================

## SYNOPSIS

    pmt story <ticket_id> [descriptor]

## DESCRIPTION

`pmt story <ticket_id> [descriptor]` is used to create an
opinionated opinionated branch called a "story". A story's
branch name takes the form of ${nick}/${ticket_id}, and has
a corresponding descriptor to make it easily identifyable and
filterable.

Calling `pmt story <ticket_id> descriptor` fetches origin,
then creates a branch named ${nick}/${ticket_id}.

## @TODO

* Add the ability to specify a topic, and show the appropriate
  documentation page.

## SEE ALSO

* pmt(1)
* README 