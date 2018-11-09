# PMT: The Thrist Quenching Feature Development Tool
PMT is an opinionated abstraction to `Git` for better feature development workflows.

The basis of PMT is version control. Our way of thinking of version control should better match tried and true feature development workflows. PMT provides an opinionated way to bundle and ship the code you write to Version Control.

The most quintessential deliverable unit is known as a `story`. A story consists of a unique hash value (a serial, ticket id, or unique descriptor), and a brief description. Stories are synonymous to feature branches in Git.

A `story` is further comproised of `subtasks`, which you can think of as the equivalent to `commits`. Tasks can be opened at any point and modifications to the code can be added to any of the open tasks at ANY given point.

This workflow is based off the Github "branch and PR" workflow. The goal of this library is to make working in this "branch and PR" workflow as frictionless as possible. By strictly enforcing an opinonated workflow, you can be sure that your master branch won't be dirtied with merges, that your commit log will be semantic and clean, and that your devs will be able to focus on work instead of working on resolving Git related workflow issues.


## History

From the `Git` [readme](https://github.com/git/git):

```
The name "git" was given by Linus Torvalds when he wrote the very first version. He described the tool as "the stupid content tracker" and the name as (depending on your mood):

random three-letter combination that is pronounceable, and not actually used by any common UNIX command. The fact that it is a mispronunciation of "get" may or may not be relevant.
stupid. contemptible and despicable. simple. Take your pick from the dictionary of slang.
"global information tracker": you're in a good mood, and it actually works for you. Angels sing, and a light suddenly fills the room.
"goddamn idiotic truckload of sh*t": when it breaks
```

PMT stands for Pearl Milk Tea, a soothing drink for nonchalant devs (you can also use PMT if you are non-nonchalant, we're non-discriminatory here). PMT an abstraction of Git that promotes healthy workflows, so that you don't even have to think about the underlying version control.