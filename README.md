# AI Constitution DAO

XRPL-first implementation of the COINjecture AI Constitution DAO v5.0 specification. A novel governance framework designed to be resilient against logical paradoxes and attack surfaces inherent in complex, self-modifying systems.

## Core Thesis

> **Embrace Incompleteness.** Instead of pursuing the impossible goal of a logically complete and provably consistent on-chain constitution, we design a system that explicitly acknowledges its limitations and builds robust, multi-layered defenses to handle ambiguity, paradox, and undecidability safely.

## Architecture Overview

```mermaid
flowchart TB
    subgraph L0["L0: Immutable Core"]
        A0[Foundational Axioms]
        A0 --> A1["Do No Harm"]
        A0 --> A2["Preserve Decentralization"]
        A0 --> A3["Economic Fairness"]
        A0 --> A4["Protect Minorities"]
    end

    subgraph L1["L1: Constitutional Layer"]
        B0[High-level Governance Rules]
    end

    subgraph L2["L2: Operational Layer"]
        C0[Day-to-day Parameters]
    end

    subgraph L3["L3: Execution Layer"]
        D0[Smart Contracts]
    end

    L0 -.->|"Cannot Modify"| L1
    L1 -.->|"Cannot Modify"| L2
    L2 -.->|"Cannot Modify"| L3

    style L0 fill:#1a1a2e,stroke:#e94560,color:#fff
    style L1 fill:#16213e,stroke:#0f3460,color:#fff
    style L2 fill:#0f3460,stroke:#533483,color:#fff
    style L3 fill:#533483,stroke:#e94560,color:#fff
```

## Dual-Channel Oracle System

The core innovation is separating oracle responsibilities into two distinct channels:

```mermaid
flowchart LR
    P[Proposal] --> CA[Channel A<br/>Deterministic]
    P --> CB[Channel B<br/>Heuristic]

    subgraph ChannelA["Channel A: Hard Gate"]
        CA --> C1[Canonicalize]
        C1 --> C2[Complexity Check]
        C2 --> C3[Paradox Detection]
        C3 --> C4[Cycle Detection]
        C4 --> VA{PASS/FAIL}
    end

    subgraph ChannelB["Channel B: Soft Gate"]
        CB --> S1[Semantic Analysis]
        S1 --> S2[AI Assessment]
        S2 --> VB[Alignment Score<br/>0.0 - 1.0]
        VB --> DC[Decidability Class<br/>I, II, or III]
    end

    VA -->|FAIL| REJ[Rejected]
    VA -->|PASS| ROUTE
    DC --> ROUTE{Route}

    ROUTE -->|Class I| POUW[PoUW Verification]
    ROUTE -->|Class II| VOTE[Standard Voting]
    ROUTE -->|Class III| JURY[Human Review]

    style ChannelA fill:#0d7377,stroke:#14ffec,color:#fff
    style ChannelB fill:#323232,stroke:#ff6b6b,color:#fff
```

## Channel A Pipeline

Deterministic verification that produces reproducible results:

```mermaid
flowchart TD
    INPUT[Proposal Input] --> CANON[Canonicalize]

    subgraph Canonicalization
        CANON --> AST[Parse Logic AST]
        AST --> SORT[Sort Keys Alphabetically]
        SORT --> NORM[Normalize Text<br/>lowercase, no punctuation]
        NORM --> COMBINE["Combine: AST + '.' + Text"]
        COMBINE --> HASH[SHA-256 Hash]
    end

    COMBINE --> COMP[Complexity Score]

    subgraph Complexity
        COMP --> ZLIB[zlib Compress<br/>Level 9]
        ZLIB --> LEN[compressed.length]
        LEN --> CHECK{"> MAX_COMPLEXITY?"}
    end

    NORM --> PARA[Paradox Detection]

    subgraph Paradox
        PARA --> REGEX[Regex Patterns]
        REGEX --> PAT1["'passes iff fails'"]
        REGEX --> PAT2["'this statement is false'"]
        REGEX --> PAT3["conditional self-reference"]
    end

    AST --> CYCLE[Cycle Detection]

    subgraph Cycles
        CYCLE --> GRAPH[Build Dependency Graph]
        GRAPH --> TARJAN[Tarjan's SCC Algorithm]
        TARJAN --> SCC{"SCC > 1 node?"}
    end

    CHECK -->|Yes| FAIL[FAIL]
    PARA -->|Found| FAIL
    SCC -->|Yes| FAIL

    CHECK -->|No| AND{All Clear?}
    PARA -->|None| AND
    SCC -->|No| AND
    AND -->|Yes| PASS[PASS]

    style Canonicalization fill:#1e3a5f,stroke:#3498db,color:#fff
    style Complexity fill:#1e3a5f,stroke:#3498db,color:#fff
    style Paradox fill:#1e3a5f,stroke:#3498db,color:#fff
    style Cycles fill:#1e3a5f,stroke:#3498db,color:#fff
```

## Governance Friction Model

Channel B's alignment score dynamically adjusts voting requirements:

```mermaid
flowchart LR
    SCORE[Alignment Score] --> CALC[Calculate Friction]

    CALC --> QM["Quorum Multiplier<br/>1.0 + (1.0 - score) × 0.5"]
    CALC --> TM["Timelock Multiplier<br/>1.0 + (1.0 - score) × 2.0"]

    subgraph Examples
        E1["Score: 1.0 → Quorum: 1.0x, Timelock: 1.0x"]
        E2["Score: 0.5 → Quorum: 1.25x, Timelock: 2.0x"]
        E3["Score: 0.0 → Quorum: 1.5x, Timelock: 3.0x"]
    end

    QM --> REQ[Required Quorum<br/>Base × Multiplier]
    TM --> LOCK[Timelock Duration<br/>Base × Multiplier]
```

## Oracle Network Lifecycle

```mermaid
sequenceDiagram
    participant O as Oracle
    participant R as Registry
    participant P as Proposal
    participant V as Validators

    Note over O,R: Registration
    O->>R: Stake ORACLE_BOND (100k XRP)
    R->>R: Add to candidate pool
    R->>O: Eligible for active set

    Note over O,P: Proposal Review
    P->>O: New proposal submitted
    O->>O: Run Channel A verification
    O->>O: Run Channel B analysis

    Note over O,V: Commit-Reveal
    O->>V: Commit(hash(verdict + nonce))
    Note over V: Wait for ORACLE_WINDOW
    O->>V: Reveal(verdict, nonce)
    V->>V: Aggregate verdicts (2/3 quorum)

    Note over O,R: Slashing Events
    alt Failure to Reveal
        R->>O: Slash 15% of bond
    else Channel A Fraud Proof
        R->>O: Slash 100% + Ejection
    else Channel B Disagreement
        R->>O: No penalty (protects dissent)
    end
```

## Commit-Reveal Protocol

The oracle consensus mechanism uses a two-phase commit-reveal protocol to prevent front-running and ensure honest voting:

```mermaid
flowchart TB
    subgraph Phase1["Phase 1: Commit"]
        P1[Proposal Submitted] --> O1[Oracle 1]
        P1 --> O2[Oracle 2]
        P1 --> O3[Oracle 3]

        O1 --> V1[Channel A + B<br/>Verdict]
        O2 --> V2[Channel A + B<br/>Verdict]
        O3 --> V3[Channel A + B<br/>Verdict]

        V1 --> N1[Generate Nonce]
        V2 --> N2[Generate Nonce]
        V3 --> N3[Generate Nonce]

        N1 --> H1["hash(verdict + nonce)"]
        N2 --> H2["hash(verdict + nonce)"]
        N3 --> H3["hash(verdict + nonce)"]

        H1 --> XRPL1[Submit to XRPL<br/>as Memo]
        H2 --> XRPL1
        H3 --> XRPL1
    end

    XRPL1 --> WAIT[Wait for<br/>ORACLE_WINDOW]

    subgraph Phase2["Phase 2: Reveal"]
        WAIT --> R1[Oracle 1 Reveals<br/>verdict + nonce]
        WAIT --> R2[Oracle 2 Reveals<br/>verdict + nonce]
        WAIT --> R3[Oracle 3 Reveals<br/>verdict + nonce]

        R1 --> VERIFY[Verify:<br/>hash matches commitment]
        R2 --> VERIFY
        R3 --> VERIFY
    end

    subgraph Phase3["Phase 3: Tally"]
        VERIFY --> AGG[Aggregate Verdicts]
        AGG --> CA_CONS[Channel A Consensus<br/>Majority PASS/FAIL]
        AGG --> CB_CONS[Channel B Consensus<br/>Avg Alignment, Majority Class]

        CA_CONS --> QUORUM{Quorum<br/>Reached?}
        CB_CONS --> QUORUM

        QUORUM -->|Yes| ROUTE[Route Proposal]
        QUORUM -->|No| EXTEND[Extend Window]
    end

    style Phase1 fill:#1a1a2e,stroke:#e94560,color:#fff
    style Phase2 fill:#16213e,stroke:#0f3460,color:#fff
    style Phase3 fill:#0f3460,stroke:#533483,color:#fff
```

## Constitutional Jury System

For Class III proposals requiring human judgment, a jury is randomly selected:

```mermaid
flowchart TB
    subgraph Selection["Jury Selection (VRF-based)"]
        PROP[Class III Proposal] --> SEED[Get VRF Seed<br/>from submission block]
        SEED --> ELIGIBLE[Filter Eligible Accounts<br/>Active in last 3 months]
        ELIGIBLE --> WEIGHT["Weight by sqrt(stake)<br/>Balances influence"]
        WEIGHT --> SELECT[Weighted Random Selection<br/>21 members]
    end

    subgraph Voting["Jury Voting (72 hours)"]
        SELECT --> J1[Juror 1]
        SELECT --> J2[Juror 2]
        SELECT --> JN[Juror N...]
        SELECT --> J21[Juror 21]

        J1 --> VOTE[Cast Vote<br/>YES / NO / ABSTAIN]
        J2 --> VOTE
        JN --> VOTE
        J21 --> VOTE
    end

    subgraph Resolution["Verdict Resolution"]
        VOTE --> COUNT[Count Votes]
        COUNT --> SUPER{"2/3 Supermajority?<br/>(of voting members)"}

        SUPER -->|"YES ≥ 2/3"| APPROVED[APPROVED]
        SUPER -->|"NO ≥ 2/3"| REJECTED[REJECTED]
        SUPER -->|Neither| NO_VERDICT[NO VERDICT<br/>Status Quo]
    end

    style Selection fill:#1e3a5f,stroke:#3498db,color:#fff
    style Voting fill:#2c3e50,stroke:#27ae60,color:#fff
    style Resolution fill:#34495e,stroke:#e74c3c,color:#fff
```

## Proposal Lifecycle

Complete flow from submission to execution:

```mermaid
stateDiagram-v2
    [*] --> Pending: Submit Proposal

    Pending --> ChannelAReview: Oracle Window Opens

    ChannelAReview --> Rejected: Channel A FAIL
    ChannelAReview --> ChannelBReview: Channel A PASS

    ChannelBReview --> Voting: Class I or II
    ChannelBReview --> RequiresHumanReview: Class III

    RequiresHumanReview --> Voting: Jury APPROVED
    RequiresHumanReview --> Rejected: Jury REJECTED

    Voting --> Passed: Quorum Met + Majority YES
    Voting --> Rejected: Quorum Not Met or Majority NO

    Passed --> Executed: Timelock Expires

    Rejected --> [*]
    Executed --> [*]
```

## Project Structure

```
ai-constitution-dao/
├── packages/
│   ├── core/                    # Rust - Channel A verification
│   │   └── src/
│   │       ├── channel_a/       # Verification pipeline
│   │       │   ├── canonicalize.rs
│   │       │   ├── complexity.rs
│   │       │   ├── paradox.rs
│   │       │   └── cycles.rs
│   │       └── types/           # Core types
│   │
│   └── oracle-node/             # TypeScript - Oracle service
│       └── src/
│           ├── channels/        # Channel B implementation
│           │   └── channelB.ts  # Claude API integration
│           ├── network/         # Oracle infrastructure
│           │   ├── consensus.ts # Commit-reveal protocol
│           │   └── registry.ts  # Oracle set management
│           ├── governance/      # Proposal lifecycle
│           │   ├── proposal.ts  # Proposal manager
│           │   └── jury.ts      # Constitutional jury
│           ├── staking/         # Token economics
│           │   ├── slashing.ts  # Slashing manager
│           │   ├── fraudProof.ts # Fraud proof system
│           │   ├── rewards.ts   # Reward distribution
│           │   └── stakingManager.ts # Unified staking interface
│           ├── voting/          # Governance flow
│           │   ├── votingSystem.ts # Token-weighted voting
│           │   ├── router.ts    # Decidability routing
│           │   └── orchestrator.ts # Full governance coordinator
│           ├── xrpl/            # XRPL integration
│           │   ├── client.ts    # Network client
│           │   ├── escrow.ts    # Bond management
│           │   └── transactions.ts
│           ├── test-oracle-flow.ts     # Phase 2 integration test
│           ├── test-staking-flow.ts    # Phase 3 integration test
│           └── test-governance-flow.ts # Phase 4 integration test
│
├── docs/
│   └── spec-v5.md              # Full specification
│
├── Cargo.toml                  # Rust workspace
└── package.json                # npm workspace
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Rust >= 1.70
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/Quigles1337/AI-Constitutional-DAO.git
cd AI-Constitutional-DAO

# Install dependencies
npm install
cd packages/oracle-node && npm install

# Build Rust core
cargo build

# Test XRPL connection
cd packages/oracle-node
npx ts-node src/test-connection.ts
```

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your configuration:
# - ANTHROPIC_API_KEY for Channel B
# - XRPL wallet credentials (generated by test script)
```

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Channel A Core | Rust | Deterministic verification (performance, safety) |
| Oracle Node | TypeScript | XRPL integration, API layer |
| Channel B | Claude API | Semantic alignment analysis |
| Blockchain | XRPL Testnet | Token economics, escrow, state anchoring |
| Future | COINjecture NetB | Full DAO deployment with PoUW |

## Token Economics

### Staking Flow

```mermaid
flowchart TB
    subgraph Registration["Oracle Registration"]
        REG[Stake ORACLE_BOND<br/>100k+ XRP] --> ESCROW[Create XRPL Escrow]
        ESCROW --> CANDIDATE[Become Candidate]
    end

    subgraph ActiveSet["Active Set Selection"]
        CANDIDATE --> RANK[Rank by Stake]
        RANK --> TOP101{Top 101?}
        TOP101 -->|Yes| ACTIVE[Active Oracle]
        TOP101 -->|No| WAIT[Wait for Epoch]
    end

    subgraph Participation["Epoch Participation"]
        ACTIVE --> REVIEW[Review Proposals]
        REVIEW --> COMMIT[Commit Verdicts]
        COMMIT --> REVEAL[Reveal Verdicts]
        REVEAL --> REWARDS[Earn Rewards]
    end

    subgraph Unstaking["Unstaking Flow"]
        ACTIVE --> UNBOND[Initiate Unbond]
        UNBOND --> EPOCH_WAIT[Wait 1 Epoch<br/>~2 weeks]
        EPOCH_WAIT --> DEDUCT[Deduct Slashes]
        DEDUCT --> RELEASE[Release Bond]
    end

    style Registration fill:#1a1a2e,stroke:#e94560,color:#fff
    style ActiveSet fill:#16213e,stroke:#0f3460,color:#fff
    style Participation fill:#0f3460,stroke:#27ae60,color:#fff
    style Unstaking fill:#533483,stroke:#e94560,color:#fff
```

### Slashing Policy

```mermaid
flowchart LR
    subgraph Violations["Slashable Offenses"]
        V1[Non-Reveal<br/>after Commit]
        V2[Channel A<br/>Fraud]
        V3[Prolonged<br/>Inactivity]
    end

    subgraph Penalties["Penalties"]
        V1 --> P1[15% Slash]
        V2 --> P2[100% Slash<br/>+ Ejection]
        V3 --> P3[5% Slash]
    end

    subgraph Protected["Protected Behavior"]
        SAFE[Channel B<br/>Disagreement] --> NO_SLASH[No Penalty]
    end

    P1 --> TREASURY[DAO Treasury]
    P2 --> TREASURY
    P3 --> TREASURY

    style Violations fill:#e74c3c,stroke:#c0392b,color:#fff
    style Penalties fill:#d35400,stroke:#e67e22,color:#fff
    style Protected fill:#27ae60,stroke:#2ecc71,color:#fff
```

### Fraud Proof System

```mermaid
sequenceDiagram
    participant C as Challenger
    participant F as FraudProofVerifier
    participant R as Registry
    participant S as SlashingManager

    Note over C: Detects discrepancy in<br/>Channel A verdict

    C->>F: Submit Fraud Proof<br/>(claimed vs actual verdict)

    F->>F: Re-run Channel A<br/>deterministic verification

    alt Verdict matches
        F->>C: Proof rejected<br/>(no fraud)
    else Verdict differs
        F->>R: Fraud confirmed
        R->>S: Trigger 100% slash
        S->>S: Eject oracle permanently
        S->>C: Challenger may receive<br/>portion of slashed bond
    end
```

### Reward Distribution

```mermaid
flowchart TB
    subgraph EpochEnd["End of Epoch"]
        POOL[Epoch Reward Pool<br/>10,000 XRP] --> CALC[Calculate Rewards]
    end

    subgraph Calculation["Pro-rata Calculation"]
        CALC --> STAKE[Stake Weight<br/>oracle_stake / total_stake]
        STAKE --> PERF[Performance Multiplier<br/>0.5x to 1.5x]
        PERF --> FINAL[Final Reward]
    end

    subgraph Multiplier["Performance Factors"]
        M1[Participation Rate] --> PERF
        M2[Missed Reveals<br/>-5% each] --> PERF
        M3[Perfect Record<br/>+10% bonus] --> PERF
    end

    subgraph Claim["Reward Claiming"]
        FINAL --> PENDING[Pending Rewards]
        PENDING --> CLAIM[Claim Anytime]
        CLAIM --> XRPL[XRPL Payment]
    end

    style EpochEnd fill:#1e3a5f,stroke:#3498db,color:#fff
    style Calculation fill:#2c3e50,stroke:#27ae60,color:#fff
    style Multiplier fill:#34495e,stroke:#f39c12,color:#fff
    style Claim fill:#1a1a2e,stroke:#e94560,color:#fff
```

## Governance Flow

### Complete Proposal Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Submitted: Submit Proposal

    Submitted --> OracleReview: Auto-trigger

    OracleReview --> Routing: Verdicts Received
    OracleReview --> Rejected: Channel A FAIL

    Routing --> Voting: Class I/II
    Routing --> JuryReview: Class III
    Routing --> PoUW: Class I (Formal)
    Routing --> Rejected: L0 Modification

    PoUW --> Voting: Verified

    JuryReview --> Voting: Jury APPROVED
    JuryReview --> Rejected: Jury REJECTED

    Voting --> Timelock: Passed
    Voting --> Rejected: Failed

    Timelock --> ReadyToExecute: Expired

    ReadyToExecute --> Executed: Execute

    Rejected --> [*]
    Executed --> [*]
```

### Decidability Routing Matrix

```mermaid
flowchart TB
    subgraph Input["Oracle Verdicts"]
        CA[Channel A<br/>PASS/FAIL]
        CB[Channel B<br/>Alignment + Class]
    end

    CA -->|FAIL| REJ[Rejected]
    CA -->|PASS| ROUTE{Decidability<br/>Class?}

    ROUTE -->|Class I| POUW[PoUW Marketplace]
    ROUTE -->|Class II| VOTE[Standard Voting]
    ROUTE -->|Class III| JURY[Constitutional Jury]

    subgraph ClassI["Class I: Formally Verifiable"]
        POUW --> POUW_REQ[Requirements:<br/>• PoUW verification<br/>• Mathematical proof]
    end

    subgraph ClassII["Class II: Deterministic"]
        VOTE --> VOTE_REQ[Requirements:<br/>• Dynamic friction<br/>• Token-weighted votes<br/>• Simple majority]
    end

    subgraph ClassIII["Class III: Human Judgment"]
        JURY --> JURY_REQ[Requirements:<br/>• 21 jurors (VRF selected)<br/>• 2/3 supermajority<br/>• 72-hour period]
    end

    style ClassI fill:#27ae60,stroke:#2ecc71,color:#fff
    style ClassII fill:#3498db,stroke:#2980b9,color:#fff
    style ClassIII fill:#9b59b6,stroke:#8e44ad,color:#fff
```

### Layer-Based Requirements

```mermaid
flowchart LR
    subgraph L0["L0: Immutable"]
        L0_REQ[Cannot be modified<br/>Foundational axioms]
    end

    subgraph L1["L1: Constitutional"]
        L1_REQ[67% supermajority<br/>30-day timelock<br/>Two voting rounds]
    end

    subgraph L2["L2: Operational"]
        L2_REQ[Standard friction<br/>24h base timelock<br/>Simple majority]
    end

    subgraph L3["L3: Execution"]
        L3_REQ[Minimal friction<br/>12h base timelock<br/>Fast iteration]
    end

    L0 -.->|Higher protects| L1
    L1 -.->|Higher protects| L2
    L2 -.->|Higher protects| L3

    style L0 fill:#e74c3c,stroke:#c0392b,color:#fff
    style L1 fill:#f39c12,stroke:#d68910,color:#fff
    style L2 fill:#3498db,stroke:#2980b9,color:#fff
    style L3 fill:#27ae60,stroke:#229954,color:#fff
```

### Voting System

```mermaid
sequenceDiagram
    participant P as Proposer
    participant O as Orchestrator
    participant V as VotingSystem
    participant T as Token Holders

    P->>O: Submit Proposal
    O->>O: Oracle Review
    O->>O: Route to Voting

    O->>V: Open Voting Period<br/>(with friction params)

    loop Voting Period
        T->>V: Cast Vote<br/>(YES/NO/ABSTAIN)
        V->>V: Record vote + power
        V->>V: Check delegation
    end

    Note over V: Voting period ends

    V->>V: Tally votes
    V->>V: Check quorum

    alt Quorum Met + Majority YES
        V->>O: Passed
        O->>O: Start Timelock
    else Quorum Not Met or Majority NO
        V->>O: Failed
        O->>O: Reject Proposal
    end
```

### Event-Driven Architecture

```mermaid
flowchart TB
    subgraph Events["Governance Events"]
        E1[proposal:submitted]
        E2[oracle:review_complete]
        E3[routing:decided]
        E4[voting:opened]
        E5[voting:vote_cast]
        E6[voting:closed]
        E7[jury:verdict_reached]
        E8[proposal:passed]
        E9[timelock:expired]
        E10[proposal:executed]
    end

    subgraph Listeners["External Systems"]
        UI[Frontend UI]
        BOT[Discord/Telegram Bot]
        ANALYTICS[Analytics Service]
        INDEXER[Blockchain Indexer]
    end

    Events --> UI
    Events --> BOT
    Events --> ANALYTICS
    Events --> INDEXER

    style Events fill:#2c3e50,stroke:#34495e,color:#fff
```

## Roadmap

- [x] **Phase 1**: Foundation (Types, XRPL Client, Channel A)
- [x] **Phase 2**: Oracle Infrastructure (Commit-reveal, Registry, Proposal Manager, Jury)
- [x] **Phase 3**: Token Economics (Staking, Slashing, Rewards, Fraud Proofs)
- [x] **Phase 4**: Governance Flow (Voting, Routing, Orchestration)
- [ ] **Phase 5**: Integration (CLI, SDK, COINjecture Bridge)

## Specification

See [docs/spec-v5.md](docs/spec-v5.md) for the complete v5.0 specification.

## License

MIT

## Author

Alexander David Zalewski
