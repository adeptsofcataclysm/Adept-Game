# Requirements

**Normative source:** `[vision.md](./vision.md)`. This document restates that vision as testable **requirements** (the word **shall** indicates a mandatory behavior). No implementation, stack, or repository layout is assumed.

**Terms:** Capitalized role and feature names match the glossary in `[vision.md](./vision.md)`.

---

## REQ-1 — Overall session flow

1. The system shall support a flow that begins from a **lobby**.
2. The system shall select the five starting **Players** from **Spectators** using the **Opening the show** mini-game before the main quiz proceeds as described in REQ-8.
3. The system shall provide a **first quiz round** in which some **question cards** may trigger **Roulette** or **Wheel of Adepts** as specified in REQ-5 and REQ-9–REQ-11. **Several** Wheel and/or Roulette mini-games shall be allowed **per main round** (not limited to a single visit before advancing the round).
4. The system shall allow progression to a **second round** only when all **question cards** on the first round’s **quiz board** are revealed (or the product’s equivalent “round complete” rule is satisfied—vision ties advancement to full revelation).
5. The **second round** shall mirror the first in structure (categories, five questions per category, **point values**, **question cards**) but shall use that round’s own themes and questions.
6. After the **second round**, the system shall run the **Between-rounds transition** (REQ-12) before the **third round**.
7. The system shall provide a **third round** of the same Adepts-style structure as prior rounds (subject to stakes behavior in REQ-12).
8. After the **third round**, the system shall support an additional **between-round transition** leading into the **Final round** (REQ-13).
9. The **Final round** shall admit the **Player** with the top score and the **Player** who opened the **“Final round”** card during the third-round **between-round transition** (REQ-13).
10. The **Final round** shall determine the winner by **5×5 Tic-Tac-Toe** as described in the vision.

---

## REQ-2 — Quiz board and rounds

1. The **Adepts game** main segment shall run for **three rounds** (before Final round mechanics in REQ-13).
2. Each **round** shall present a **quiz board** with several **question categories**.
3. Each **category** shall hold **five questions**.
4. Each **question** shall display a **point value** on the **quiz board**.
5. Choosing a **question** shall open a **question card** (REQ-4–REQ-7).
6. **Five Players** shall compete; scores and **turn** shall attach to **Player number** (seats **1–5**), not to a fixed real-world identity.
7. Only the **Host** shall advance the session into the **next round** (vision: structural pacing).

---

## REQ-3 — Round screen layout

During a **round**, the interface shall include:

1. A **top menu**.
2. The main **quiz board** (categories and questions).
3. A **Player strip** showing the five seats.
4. **Spectator chat** positioned to the **left** of the main board.

---

## REQ-4 — Scoring and Host score controls

1. On a **correct** answer for a **standard card** (REQ-5.1), the system shall **add** that card’s **point value** to the active **Player**’s score.
2. On a **wrong** answer for a **standard card**, the system shall **subtract** that card’s **point value** from the active **Player**’s score.
3. The **Host** shall be able to change **scores** via card flows, by entering a value in a **Player**’s score field, or using **+** / **−** controls in steps of **100** points, as stated in the vision.

---

## REQ-5 — Question card types

### REQ-5.1 — Standard card

1. The **prompt** may be text, an image, or video.
2. On a **correct** answer, the **Player** gains the card’s points and may pick the next cell on the board.
3. On a **wrong** answer, the **Player** loses the card’s points and **turn order** moves to the **Player to their right**.

### REQ-5.2 — Wheel of Adepts (three spins)

1. Opening this card shall send the **Player** into the **Wheel of Adepts** mini-game (REQ-11).
2. After **each** spin, points shall be added or removed according to the sector landed on.
3. **Special sectors** shall behave as follows:
  - **Swap:** the **Player** chooses another **Player** and **exchanges** scores with them.
  - **Catch the thief:** the **Player** takes **500** points from another **Player**.
  - **Wipe:** **all** **Players**’ scores become zero.
  - **Recite a poem:** the **Player** may recite a poem for points set by the **Host**, or skip.

### REQ-5.3 — Question card plus one wheel spin

1. If the answer is **correct**, the **Player** earns **one** spin on the **Wheel of Adepts**.
2. Sector rules shall match REQ-5.2 except that only **one** spin occurs.

### REQ-5.4 — Pandora’s box

1. Opening this card shall start the **Roulette** mini-game (REQ-10).

### REQ-5.5 — “Raccoon in a sack”

1. When this card opens, the current **Player** shall **pass the question** to another **Player**.
2. The passing **Player** shall **not** answer the question themselves.

---

## REQ-6 — Reveals and judging (main game)

1. The **Host** shall open **question** and **answer** **cards** and judge whether a **Player**’s answer is correct.
2. On a **wrong** answer, the **Host** shall pass play to the **next Player** per card rules (e.g. **standard card**: **Player** on the right; other types per their sections).
3. The **Host** shall be able to **restore** **cards** on the **quiz board** where the vision implies board restoration as a Host capability.
4. A **Player** may open a **question card** such that **only the question** is revealed initially.
5. **Only the Host** may reveal the **answer** for everyone.

---

## REQ-7 — Spectators during main rounds

1. **Spectators** shall see the main game and **mini-games**.
2. **Spectators** shall be able to use **Spectator chat**.
3. During **main rounds**, **Spectators** shall **not** perform **Player**-level actions.

---

## REQ-8 — Opening the show

1. The **Opening the show** mini-game shall designate exactly **five** starting **Players** for the seats.
2. All participants shall see the same view: an **emoji display area** and **text chat**.
3. **Spectators** shall see **emoji** prompts and type guesses in chat.
4. The **Host** shall mark correct answers in a table of **Spectators** and advance the room to the **next** emoji.
5. The **top five** **Spectators** by correct answer count shall become **Players** and receive **seat numbers**.

---

## REQ-9 — Spectator bets

1. The system shall support a **Spectator and Player bets** before **Round 1** starts
2. This should be a plugin.
3. **Users** shall **bet on a Player number** (seat).
4. Winners shall be those who picked the **Player number** that, after **three rounds**, has the **highest** total score. **Winner resolution and presentation** (mapping final `scores` to winning seat(s), handling ties, and announcing or displaying who won the pool) shall be implemented as a **separate plugin** from the pre–Round 1 betting segment; that plugin shall consume authoritative **`scores`** after three rounds and the **bets** persisted in the betting segment’s `segmentState` (see `requirements/plugin.md`).

---

## REQ-10 — Roulette and lottery

1. **Roulette** shall be triggerable when a **Pandora’s box** (or equivalent) **question card** opens. The system shall support **more than one** complete Roulette flow **within the same main round** (e.g. another Pandora’s box later on the board).
2. All **five Players** shall take turns with the **revolver drum** until one **Player** is **eliminated**.
3. The eliminated **Player** shall become a **Spectator**.
4. To continue the main game, a **Lottery** shall run: the **Host** builds a participant list from **Spectators**, then a random draw selects a winner who becomes a **Player** again (seat assignment per product rules: “replacing or filling a seat per your rules” in vision).

---

## REQ-11 — Wheel of Adepts (mini-game)

1. The **Wheel of Adepts** shall be available when the matching **question card** opens. The system shall support **more than one** Wheel session **within the same main round** (e.g. multiple wheel cards across the board).
2. Variants shall be supported: **three** spins with **no** prior question, or **one** spin after a **correct** answer on the combined card (REQ-5.3).
3. When the card opens, the active **Player** shall receive the wheel; **Host** and **Spectators** shall switch to the wheel view.
4. Final scoring from the wheel shall be applied by the **Host** or **automation** (vision allows either).

---

## REQ-12 — Story video

1. This transition shall be supported as a **between-round segment** (it may be implemented as a plugin segment).
2. **Host**, **Players**, and **Spectators** shall all watch a **story video**.
3. Then each **Player** shall enter a **donation** of points to “good causes”, or **0**.
4. Donations shall be **≥ 0**, shall not exceed the **Player**’s current score, and shall not be negative.
5. A small **table** on the board (three columns on the right) shall **store** these amounts until the end of the game.
6. Stored amounts shall act as **stakes**: when a **specific card** opens in **Round 3**, they **activate**—multiplied by **×2** and **redistributed** among other **Players** per that card’s rules.

---

## REQ-13 — Transition to Final round

1. After **Round 3**, the system shall support a **between-round transition** into the **Final round**.
2. Eligibility for the **Final round** shall include the **Player** with the **top score** and the **Player** who opened the **“Final round”** card in that transition (REQ-1.9).
3. The **Final round** shall resolve the winner via **5×5 Tic-Tac-Toe** (REQ-1.10).

---

## REQ-14 — Roles and permissions (product)

1. **Host** shall run the session: pacing, reveals, scoring, and structural moves.
2. In this product, **Host** shall correspond to use of the `**/admin`** route after successful **authentication**.
3. **Host** shall control **rounds** and the **question board**, manage **Players**, open **Roulette** and **Wheel of Adepts** (including **repeated** opens **within** a round), and start the **Lottery** after each **Roulette** that requires it.
4. **Player** shall see the **quiz board**, use **Wheel of Adepts** when allowed, and participate in **Russian roulette** when **Roulette** runs.
5. **Spectator** shall see everything during **rounds** but not take **Player**-level actions.
6. Before a **Lottery**, a **Spectator** may **opt out** of being drawn as a new **Player**.
7. Any **Spectator** may join **Spectator picks**.
8. A participant becomes a **Spectator** after completing the **name entry** screen (viewer onboarding).

---

## REQ-15 — Cross-cutting expectations implied by the vision

1. The system shall present **shared** experiences where the vision states everyone sees the same view (e.g. **story video**, **Opening the show** layout, **Wheel** view for **Host** and **Spectators**).
2. The system shall enforce **role-appropriate** actions: **Host**-only session advancement, **Host**-only answer reveal, **Spectator** restrictions during main **rounds**, and **Player** mini-game participation as specified above.

---

## Document control

- **Authoritative product text** remains `[vision.md](./vision.md)`.
- When the vision changes, update this requirements list to stay aligned.

