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
│           ├── channels/        # Channel A/B implementations
│           │   └── channelB.ts  # Claude API integration
│           └── xrpl/            # XRPL integration
│               ├── client.ts    # Network client
│               ├── escrow.ts    # Bond management
│               └── transactions.ts
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

## Roadmap

- [x] **Phase 1**: Foundation (Types, XRPL Client, Channel A)
- [ ] **Phase 2**: Oracle Infrastructure (Commit-reveal, P2P)
- [ ] **Phase 3**: Token Economics (Bonding, Slashing)
- [ ] **Phase 4**: Governance Flow (Proposals, Voting, Jury)
- [ ] **Phase 5**: Integration (CLI, SDK, COINjecture Bridge)

## Specification

See [docs/spec-v5.md](docs/spec-v5.md) for the complete v5.0 specification.

## License

MIT

## Author

Alexander David Zalewski
