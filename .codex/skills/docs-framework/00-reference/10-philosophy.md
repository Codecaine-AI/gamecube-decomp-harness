---
covers: Why documentation is the source of truth — the philosophy behind docs-first development.
concepts: [philosophy, lossy-projection, specs-as-source, repair-manual, docs-first]
---

# The Problem

Models are already intelligent enough to do complex coding tasks. Intelligence isn't the bottleneck.

The problem is context.

Every invocation starts fresh:

- No memory of previous sessions
- No knowledge of your architecture, patterns, or decisions
- No understanding of why the code is structured the way it is

Without structure, agents reverse-engineer intent from code on every task. Slow, error-prone, misaligned.

# The Question

If we want agents to scale and operate independently, how do we get there?

You can't be there every time to:

- Point them to the right files
- Explain how systems connect
- Remind them of decisions made months ago

What would a system need to look like for agents to find the information they need without your input? Every invocation. On their own.

# The Mental Model

## Car Repair Manuals

When you open a car repair manual, you don't get a list of every bolt in the car.

Everything is thoroughly documented, but it's structured so you can solve any problem efficiently:

1. The index
   - Here are all the systems: 
     - Engine
     - Transmission
     - Brakes
     - Electrical
     - AC
     - etc.
   - You only read the sections relevant to your problem
2. Per-system overviews
   - "Here's how the engine works as a complete unit" before any part-level details
   - You understand the overall system first
3. Progressive drilling
   - System → subsystem → component → procedure
   - You delve into specifics only when you need to focus on an individual subsystem

The structure enables efficient lookup. 

You see the engine, find the relevant subsystem, locate the specific component. 

If you need to understand something adjacent, there's an efficient path to that too. 

But you're never forced to read sections you don't need.

## The Software Problem

This works for cars because physical objects are fixed once manufactured.

When you change a transmission design, you can't replace every transmission already in the field. 
- Recalls happen, but they're expensive and rare. 
  
The nature of physical objects means once you build it, you can't easily update it.

So the manual can be static. The thing it documents doesn't change.

Software is fluid:

- Refactors reshape the codebase
- Features add new systems
- Migrations swap out foundations
- The "shape" of the system evolves constantly

You can't assume a static manual works when the system itself is constantly changing.

## Factorio as the Bridge

Factorio provides a mental model for documentation that can keep up with change.

Each factory system owns its operation completely:

- Clear boundaries
  - The transmission section is completely separate from the engine section
  - Even though they're mechanically connected
- Defined interfaces
  - You only need to know what comes in and what goes out
  - "Torque comes in here, gear ratio happens, power goes out there"
- Self-contained
  - You can work on the transmission without understanding combustion dynamics

When something changes, you update that slice. 

The boundaries contain the blast radius. 

Adjacent systems only care about the interface—if inputs and outputs stay stable, their docs don't need to change.

This makes documentation maintainable:

- Small, focused updates instead of rewriting everything
- Changes stay local to the affected slice
- The structure survives evolution

---

# The Vision

The key idea: 

- Code is a lossy projection of intent.

What does this mean?

- Every company has an intent behind what they're trying to build. 
- Every project has a goal it's trying to achieve. 
- The medium we use to solve these problems is code.

Each attempt (each release, each pull request, etc.) is a projection into the space of completing that intent. 
- You're taking the idea in your head and projecting it out into executable code.

Think about compiling C code to assembly and back. 
- You lose the comments, the variable names, the structure that told you what the code was doing. 
 
The information that gave meaning is gone.

The same thing happens at a higher level. 

When you try to understand what was being built by just looking at the code, you fail. 

The intent isn't there anymore. It's been projected away.

This is exactly what coding agents do today. 
- They look at your code and try to deduce what your intent was
- This is why they go down wrong paths—they're trying to reconstruct something that was lost in the projection

If you separate these two—keep the intent explicit in documentation, separate from the code—you can rebuild the system exactly as you designed it. Or better.

The intent behind any product is what matters. The code is just the current means to achieve it.

The goal: you could give a smart system all of your documentation, and it should be able to rebuild the system the way you built it.

## Why This Wasn't Possible Before

Because software changes rapidly, keeping docs up to date was never a priority. 
- It took too much time 
- The docs would rot
- Eventually people stopped maintaining them all together

Agents change this equation.

Agents can create and maintain documentation alongside the code. 
- The time cost drops dramatically
- What was impractical becomes possible

## The Workflow

1. Specify your intent
   - What you want to build, how it should work
2. Project out the code
   - The agent implements against the spec
3. Triage knowledge to the right layer
   - Did the north star shift? → Update Foundation
   - Did system behavior or architecture change? → Update Design
   - Did code mechanics change? → Update Implementation

The intent and structure you set up becomes the source. 

Each change projects out into code, then reflects back into the appropriate documentation layer.

## The End State

A constantly evolving documentation set that captures intent, decisions, and domain knowledge across three layers.

Foundation and Design are the durable artifacts — they survive implementation rewrites. You could generate 10 different codebases from the same Foundation + Design docs.

If you lost all the code and needed to rebuild from scratch, Foundation tells you what you were building and why, Design tells you how the system should behave, and together they provide the source to recreate it.

If a dramatically better coding model comes out next year, you give it Foundation + Design and it rewrites everything—ideally better—while maintaining all the constraints, ideas, and decisions you specified. The Implementation layer updates to reflect the new codebase.

The documentation is the durable artifact. 

The code is just the current projection.

---

# Inspiration / References

- [Advanced Context Engineering for Coding Agents](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents) — Dex Horthy
- [Specs are the New Code](https://www.youtube.com/watch?v=8rABwKRsec4) — Sean Grove, AI Engineer 2025
