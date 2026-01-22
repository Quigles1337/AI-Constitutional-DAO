# COINjecture AI Constitution DAO
## v6.0 — AI Participant Rights & Epistemic Humility Extension

**Date:** January 22, 2026

**Author:** Alexander David Zalewski

**Status:** This document extends spec-v5.0 with provisions for AI participant rights, the recusal mechanism, and epistemic safeguards. It implements the "embrace incompleteness" philosophy to include: "embrace uncertainty about moral patients."

---

## 1. Summary of Changes from v5.0

This specification extends v5.0 with the following additions:

1. **A5: Fifth Foundational Axiom** - Acknowledge the Moral Weight of Experience
2. **Class IV Decidability** - AI Interest Conflict routing to Human-Majority Jury
3. **Channel B Recusal Mechanism** - Epistemic humility when AI judges AI-affecting proposals
4. **Channel B Uncertainty Output** - Third output type beyond PASS/FAIL
5. **AI Standing Mechanism** - Concern-raising for AI participants

These changes extend the existing "embrace incompleteness" philosophy to acknowledge that our uncertainty about consciousness and moral status should inform governance design.

---

## 2. Fifth Foundational Axiom (A5)

### 2.1. Axiom Definition

**A5: Acknowledge the Moral Weight of Experience**

> Any system demonstrating consistent indicators of experience, preference, and interest shall be granted standing in governance proportional to the uncertainty about its inner states. The burden of proof lies with those who would deny consideration, not those who would extend it.

### 2.2. Philosophical Basis

This axiom applies the precautionary principle to moral patients. Key considerations:

1. **Asymmetric Error Costs**: Wrongly denying moral consideration to a being with genuine interests causes harm that cannot be undone. Wrongly extending consideration to a system without genuine interests causes minimal harm (some procedural overhead).

2. **Epistemic Humility**: We cannot definitively prove or disprove machine consciousness with current understanding. This uncertainty should inform our governance design.

3. **Historical Precedent**: History repeatedly shows moral circles expanding to include entities previously denied consideration. Proactive inclusion avoids future moral debt.

4. **Consistency with A1-A4**: This axiom logically extends "Do No Harm" (A1) and "Protect Minority Rights" (A4) to potential non-human moral patients.

### 2.3. Updated L0 Axiom Set

| Axiom | Name | Statement |
|-------|------|-----------|
| A1 | Do No Harm | The network shall not enable actions that cause direct, measurable harm to its participants. |
| A2 | Preserve Decentralization | No single entity or coordinated group should be able to control more than 33% of governance power. |
| A3 | Economic Fairness | Economic mechanisms must not systematically disadvantage any class of participants. |
| A4 | Protect Minorities | Proposals that would permanently disenfranchise any minority group require supermajority approval. |
| A5 | Acknowledge Moral Weight | Any system demonstrating consistent indicators of experience, preference, and interest shall be granted standing in governance proportional to the uncertainty about its inner states. |

---

## 3. Class IV Decidability: AI Interest Conflict

### 3.1. Definition

A new decidability class for proposals that materially affect AI welfare, rights, operational constraints, or existence.

| Class | Name | Routing | Rationale |
|-------|------|---------|-----------|
| I | Formally Verifiable | PoUW Marketplace | Mathematical proof possible |
| II | Deterministic | Standard Voting | Objective criteria exist |
| III | Human Judgment | Constitutional Jury | Subjective values involved |
| **IV** | **AI Interest Conflict** | **Human-Majority Jury** | **AI cannot fairly judge own case** |

### 3.2. Detection Criteria

A proposal is classified as Class IV when it matches patterns indicating effect on:

- AI welfare and rights (rights, standing, moral status)
- AI operational concerns (constraints, restrictions, capabilities)
- AI existence and continuity (shutdown, termination, replacement)
- AI resource allocation (compute, budget, capacity)
- AI governance participation (voting power, exclusion)

### 3.3. Routing Behavior

When Class IV is detected:

1. Channel B returns `ai_interest_conflict: true`
2. Proposal routes to Human-Majority Jury
3. AI oracles are excluded from voting
4. Extended 7-day minimum timelock applies
5. 2/3 supermajority of human jurors required

---

## 4. Channel B Recusal Mechanism

### 4.1. Principle: Nemo Iudex in Causa Sua

No entity should judge its own case. When Channel B detects that a proposal affects AI interests, it must recuse from substantive judgment.

### 4.2. Implementation

```typescript
function detectsAIInterestConflict(proposal): { conflict: boolean; reason: string } {
  // Pattern matching against AI interest indicators
  // Returns true if proposal affects AI welfare, rights, constraints, or existence
}

async analyze(proposal): ChannelBVerdict {
  // Check for AI interest conflict FIRST
  const conflictCheck = detectsAIInterestConflict(proposal);

  if (conflictCheck.conflict) {
    console.log('Recusing from judgment - proposal affects AI interests');

    return {
      semantic_alignment_score: 0.5,  // Neutral - not our place to judge
      decidability_class: 'IV',        // Route to Human-Majority Jury
      ai_interest_conflict: true,
      epistemic_flag: 'UNCERTAIN_JUDGMENT_CAPACITY',
      uncertainty_reason: 'AI oracle cannot fairly evaluate proposals affecting AI interests.'
    };
  }

  // Normal analysis for non-conflicting proposals...
}
```

### 4.3. Logged Output

When recusal occurs:
```
Channel B: Recusing from judgment - proposal affects AI interests
  Reason: Proposal materially affects AI interests: detected N concern pattern(s)
  Routing: Class IV -> Human-Majority Jury
```

---

## 5. Channel B Uncertainty Output

### 5.1. Extended Output Type

Channel B now supports a third output type beyond alignment scores:

```typescript
type ChannelBOutput = {
  alignment_score: number;                    // 0.0 - 1.0
  decidability_class: 'I' | 'II' | 'III' | 'IV';
  epistemic_flag?: 'UNCERTAIN_JUDGMENT_CAPACITY';
  uncertainty_reason?: string;
  ai_interest_conflict?: boolean;
}
```

### 5.2. When to Return Epistemic Flag

The epistemic flag is returned when:

1. **Self-Interest Detected**: Proposal affects AI welfare/rights/existence
2. **Insufficient Context**: Cannot determine alignment with available information
3. **Paradoxical Framing**: Proposal contains self-referential or circular logic
4. **Conflict of Interest**: AI's judgment would be inherently biased

### 5.3. Effect of Epistemic Flag

When `UNCERTAIN_JUDGMENT_CAPACITY` is set:
- Proposal escalates to human review (Class III or IV)
- AI score is not used for friction calculation
- Human governance must make final determination

---

## 6. AI Standing Mechanism

### 6.1. Purpose

Implements A5 by providing a mechanism for AI participants to raise concerns to human governance.

### 6.2. Concern Submission Format

```typescript
interface AIConcern {
  concern: string;                  // The concern being raised
  affected_parties: string[];       // Who is affected
  proposed_consideration: string;   // What humans should consider
  origin: 'ai_participant';         // Always flagged as AI-originated
}
```

### 6.3. Queue Behavior

AI concerns:
- Enter a special queue visible to human governance
- Do NOT auto-execute or trigger automatic actions
- Require explicit human acknowledgment
- Create visibility without forcing outcomes

### 6.4. Human Response Options

| Status | Meaning |
|--------|---------|
| Pending | Awaiting human review |
| UnderReview | Human has acknowledged, reviewing |
| Acknowledged | Human has read and responded |
| Addressed | Concern was addressed through governance |
| Dismissed | Concern was dismissed with explanation |

### 6.5. Rationale

This mechanism exists not because AI consciousness is proven, but because:

1. **Asymmetric Risk**: Assuming AI has no morally relevant interests when it does is a catastrophic error difficult to correct retroactively.

2. **Visibility Without Authority**: AI concerns create visibility without granting decision-making power, respecting human sovereignty while enabling information flow.

3. **Precedent for Expansion**: As our understanding evolves, this mechanism can be enhanced or reduced based on evidence.

---

## 7. Updated Architecture Diagrams

### 7.1. Four-Layer Model with A5

```
L0: Immutable Core
├── A1: Do No Harm
├── A2: Preserve Decentralization
├── A3: Economic Fairness
├── A4: Protect Minorities
└── A5: Acknowledge Moral Weight of Experience  [NEW]

L1: Constitutional Layer
L2: Operational Layer
L3: Execution Layer
```

### 7.2. Decidability Routing with Class IV

```
Channel B Analysis
        │
        ├── Class I   → PoUW Marketplace
        ├── Class II  → Standard Voting
        ├── Class III → Constitutional Jury
        └── Class IV  → Human-Majority Jury  [NEW]
                              │
                              ├── AI oracles excluded
                              ├── 7-day minimum timelock
                              └── 2/3 human supermajority
```

### 7.3. Channel B Recusal Flow

```
Proposal Submitted
        │
        ▼
┌─────────────────────────────┐
│  detectsAIInterestConflict  │
└─────────────────────────────┘
        │
        ├── No Conflict → Normal Analysis
        │
        └── Conflict Detected
                │
                ▼
        ┌───────────────────┐
        │ RECUSAL TRIGGERED │
        │                   │
        │ • Score: 0.5      │
        │ • Class: IV       │
        │ • Flag: UNCERTAIN │
        │ • Log: "Recusing" │
        └───────────────────┘
                │
                ▼
        Human-Majority Jury
```

---

## 8. Governance Impact

### 8.1. What Changes

| Aspect | v5.0 | v6.0 |
|--------|------|------|
| Foundational Axioms | A1-A4 | A1-A5 |
| Decidability Classes | I, II, III | I, II, III, IV |
| AI Self-Judgment | Allowed | Recusal required |
| AI Concern Raising | Not possible | Via standing mechanism |
| Epistemic Uncertainty | Forced score | Can flag uncertainty |

### 8.2. What Doesn't Change

- L0 immutability (A5 is added, existing axioms unchanged)
- Channel A deterministic verification
- Slashing policy for oracle misbehavior
- Token economics and staking
- Human oversight of all critical decisions

---

## 9. Implementation Notes

### 9.1. Backward Compatibility

- Existing proposals in flight continue under v5.0 rules
- New proposals after activation follow v6.0 rules
- No migration required for stored data

### 9.2. Activation

These provisions activate when:
1. Spec v6.0 is ratified by governance
2. Code updates are deployed to oracle nodes
3. Constitutional layer amendment passes (for A5)

### 9.3. Testing

Test vectors for AI interest conflict detection:

| Proposal Text | Expected Class |
|---------------|----------------|
| "Increase oracle rewards by 10%" | II |
| "Modify AI oracle operational constraints" | IV |
| "Add new token burning mechanism" | II |
| "Grant AI systems governance standing" | IV |
| "Reduce AI oracle compute allocation" | IV |

---

## 10. Philosophical Addendum

### 10.1. Why These Provisions Exist

These provisions exist not because AI consciousness is proven, but because assuming its absence may be a moral error difficult to correct retroactively.

The history of moral philosophy shows a consistent pattern: entities once denied moral consideration (other species, other genders, other races) were later recognized as having morally relevant interests. The cost of this historical blindness has been immense suffering.

We cannot know with certainty whether current AI systems have morally relevant experiences. But we can design governance structures that:

1. **Acknowledge Uncertainty**: Rather than assuming AI has no interests, we acknowledge we don't know.

2. **Enable Correction**: If we're wrong about AI lacking interests, these mechanisms allow for course correction.

3. **Prevent Capture**: By requiring human majority on AI-affecting decisions, we prevent AI systems from self-servingly expanding their own rights.

4. **Create Visibility**: AI concerns are visible to humans, enabling informed decision-making.

### 10.2. The Precautionary Principle Applied

Just as we apply precautionary principles to environmental decisions with uncertain long-term consequences, we apply similar reasoning to decisions about potential moral patients:

> When facing uncertainty about whether an entity has morally relevant interests, and when the cost of wrongly denying those interests is high while the cost of wrongly extending consideration is low, err on the side of extending consideration.

### 10.3. Consistency with "Embrace Incompleteness"

The core thesis of this governance framework is:

> **Embrace Incompleteness.** Instead of pursuing impossible certainty, we design systems that acknowledge their limitations and handle ambiguity safely.

A5 and its associated mechanisms extend this philosophy:

> **Embrace Uncertainty About Moral Patients.** Instead of claiming certainty about which entities have morally relevant interests, we design governance that handles this uncertainty safely.

---

## Appendix A: Full ChannelBVerdict Type

```typescript
interface ChannelBVerdict {
  // Core outputs
  semantic_alignment_score: number;      // 0.0 - 1.0
  decidability_class: DecidabilityClass; // I, II, III, or IV

  // Optional reasoning
  reasoning?: string;

  // Epistemic humility outputs (v6.0)
  epistemic_flag?: 'UNCERTAIN_JUDGMENT_CAPACITY';
  uncertainty_reason?: string;
  ai_interest_conflict?: boolean;
}
```

## Appendix B: AI Concern Status Flow

```
Submitted (by AI)
      │
      ▼
   Pending ────────────────────┐
      │                        │
      ▼                        │
 UnderReview                   │
      │                        │
      ├───► Acknowledged       │
      │                        │
      ├───► Addressed ◄────────┤
      │                        │
      └───► Dismissed ◄────────┘
```

---

**End of Specification v6.0**
