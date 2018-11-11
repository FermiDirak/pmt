Bob is working for a blockchain backed social media startup with 20 engineers.

Bob goes to JIRA and looks for a cool ticket to work on.

Bob finds a cool ticket to work on: "Add a surveillance backdoor to the core messaging system".

Bob is excited.

## Typical workflow

Bob goes to his terminal and opens a new **story**:

```
master ~/project> pmt story DEV-69473 "Add a surveillance backdoor to the core messaging system"
Branch bob/DEV-69473 created!
Checking in...
bob/DEV-69473 ~/project>
```

Bob sips some boba and gets to work on implementing the feature.
Bog is ready to commit his changes.

```
bob/DEV-69473 ~/project> pmt add -A
bob/DEV-69473 ~/project> pmt task --commit "implement NSA backdoor"
Created and committed to task 01 "implement NSA backdoor"
```

Bob writes tests for the code he writes, so Bob creates a task to write tests.

```
bob/DEV-69473 ~/project> pmt task "write tests for NSA backdoor"
Created task 02 "write tests for NSA backdoor"
```

Bob writes some tests and is ready to commit his code.

```
bob/DEV-69473 ~/project> pmt commit -A 02
Committed changes to "write tests for NSA backdoor"
```

A test is failing so Bob goes back to writing his NSA backdoor.

```
bob/DEV-69473 ~/project> pmt add -A
bob/DEV-69473 ~/project> pmt tasks
  01 "implement NSA backdoor"
  02 "write tests for NSA backdoor"

bob/DEV-69473 ~/project> pmt commit 02
```

## Working on multiple Stories

After a meeting, bob realizes he needs switch his focus to a more pressing feature.

```
bob/DEV-69473 ~/project> pmt stories
  * master
  * DEV-69473 "Add a surveillance backdoor to the core messaging system"
  * DEV-69459 "Document messaging schemas"
  * DEV-69451 "Add a GDPR popup to landing page"

bob/DEV-69473 ~/project> pmt checkout /GPDR/
  stashing staged changes...
  checkout out to DEV-69451 "Add GDPR popup to landing page"

bob/DEV-69451 ~/project> pmt where
  DEV-69451 "Add GDPR popup to landing page"
```

## Making a pull request

Let's fast forward. Bob has finally finished implementing the GDPR landing page. He's ready to submit a pull request.

```
bob/DEV-69451 ~/project> pmt mpr
```

A pull request is created on Bob's hosting service (in this case Github).

A coworker approves Bob's changes and Bob merges and squashes his changes to master.

```
bob/DEV-69451 ~/project> pmt update
  fetching latest changes to master...
  It looks like the current branch has been merged to master. Delete branch? [y/n] y
  checking out to master...

master ~/project>
```