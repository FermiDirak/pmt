# PMT -- a feature development tool
PMT is an opinionated abstraction to `Git` for better feature development workflows.

The basis of PMT is version control. Our way of thinking of version control should better match tried and true feature development workflows. PMT provides an opinionated way to bundle and ship the code you write to Version Control.

The most quintessential deliverable unit is known as a `feature`. A feature consists of a unique hash value (a serial, ticket id, or unique descriptor), and a brief description. Features are synonymous to feature branches in Git.

A `feature` is further comproised of `tasks`, which you can think of as the equivalent to `commits`. Tasks can be opened at any point and modifications to the code can be added to any of the open tasks at ANY given point.

This workflow is based off the Github "branch and PR" workflow. The goal of this library is to make working in this "branch and PR" workflow as frictionless as possible. By strictly enforcing an opinonated workflow, you can be sure that your master branch won't be dirtied with merges, that your commit log will be semantic and clean, and that your devs will be able to focus on work instead of working on resolving Git related workflow issues.
