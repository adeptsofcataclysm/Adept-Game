# Vision

High-level product vision for the game application.

## Overall game flow

Game starts from lobby. Players are choosen from Spectators via **Opening the show** mini-game.

Then we have a first quiz round. Some question cards can trigger **Roulette** and **Wheel of Adepts** mini-games. **Several** such mini-games may run **in the same round** (each time a matching card opens or the Host returns to the quiz and later opens another).

When all question cards are revealed we can proceed to the second round.

Second round is the same as first but with own themes and questions.

There is a between-round transition after second round  - **Between-rounds transition**.

Then players go through questions in third round.

There is an additional between-round transition from third round to the Final round.

PLayer with top score and player who opened "Final round" card in between-round transition are participating in Final Round.

Winner defined by 5x5 TicTacToe in a Final round.

## Adepts game

The main game runs in **three rounds**. Each round has several **question categories**. Every category holds **five questions**. Each question has a **point value** shown on the game board.

Choosing a question opens a **question card**. Several card types exist (described below). A card shows the prompt and a control to reveal the answer.

**Five Players** compete. A correct answer **adds** that card’s points to the active Player slot; a wrong answer **subtracts** points. Scores are tied to **Player number** (seat 1–5), not to a fixed real-world identity—who sits in a seat can change across the show.

Only the **Host** advances the session into the next round.

The round screen includes:

- a top menu
- the main **quiz board** (categories and questions)
- a **Player strip** (the five seats)
- a **Spectator chat** to the left of the main board

### Roles and what they do during the main game

**Host** — Opens question and answer cards, judges whether a Player’s answer is correct. On a wrong answer, passes play to the next Player. Can restore cards on the quiz board, award or adjust scores via card flows, by typing into a Player’s score field, or with **+** / **−** controls (step **100** points). Navigates between board states and transitions.

**Player** — Plays under a specific seat number. May open a question card; when they do, **only the question** is revealed. **Only the Host** may reveal the answer for everyone.

**Spectator** — Watches the main game and mini-games. Spectators can use the **Spectator chat**.

### Question card types

#### Standard card

The prompt may be text, an image, or video.

On a **correct** answer, the Player gains the card’s points and may pick the next cell on the board. On a **wrong** answer, they lose the card’s points and **turn order** moves to the **Player to their right**.

#### Wheel of Adepts — three spins

Opening this card sends the Player into the **Wheel of Adepts** mini-game. After **each** spin, points are added or removed depending on where the wheel lands.

Besides plain score sectors, there are **special sectors**:

a) **Swap** — the Player chooses another Player and **exchanges** scores with them.  
b) **Catch the thief** — the Player takes **500** points from another Player.  
c) **Wipe** — **all** Players’ scores go to zero.  
d) **Recite a poem** — the Player may recite a poem for points awarded by the Host; they may also skip it.

#### Question card + one wheel spin

If the answer is **correct**, the Player earns **one** spin on the Wheel of Adepts. Rules match the wheel section above, but there is only **one** spin.

#### Pandora’s box

Opening this card starts the **Roulette** mini-game (see below).

#### “Raccoon in a sack”

When this card opens, the current Player **passes the question** to another Player. They **cannot** answer it themselves.

## Mini-games

### Opening the show

A **starter** mini-game picks the **five starting Players** who will take the seats.

Everyone sees the same view: an emoji display area and a text chat. **Spectators** see the emoji prompts and type guesses in chat. The **Host** marks correct answers in a table of Spectators and pushes the **next** emoji to the room. The **top five** Spectators by correct answers become **Players** and receive seat numbers.

### Spectator picks

After all **Round 1** Players are known—but **before** Round 1 begins—Spectators play a short mini-game where they **bet on a Player number**. Winners are those who picked the Player seat that ends the **three rounds** with the **highest** total score.

### Roulette

Triggered when a **Pandora’s box** (or equivalent) card opens on the board. **Multiple** Roulette runs may occur **within one main round** as different cards open across the show.

All **five Players** take turns “spinning” a **revolver drum** until one Player is **eliminated**. That Player becomes a **Spectator**. To continue the main game, a **lottery** is run: the Host fills a participant list from **Spectators**, then a random draw picks a winner who becomes a **Player** again (replacing or filling a seat per your rules).

### Wheel of Adepts

Available when the matching card is opened. **Multiple** Wheel sessions may occur **within one main round** (each matching card can start another). Two variants exist: **one** spin after a correct answer on a combined card, or **three** spins with **no** prior question. When the card opens, the active Player gets the wheel; **Host** and **Spectators** also switch to the wheel view. Final scoring is applied by the **Host** (or automated).

### Between-rounds transition

This beat runs **only after Round 2**. When Round 2 ends, everyone (**Host**, **Players**, **Spectators**) watches a **story video**. Then each **Player** enters how many points they **donate** to “good causes” (or **0**). Donations cannot exceed their current score and cannot be negative. A small table on the board (three columns on the right) **stores** these amounts until the end of the game. Those stored amounts act as **stakes**: when a specific card opens in **Round 3**, they **activate**—multiplied by **×2** and **redistributed** among other Players per the card rules.

## Roles and permissions

**Host** — Runs the session: pacing, reveals, scoring, and structural moves. In this product, the Host is whoever uses the **`/admin`** route and completes **authentication**.

- Controls rounds and the question board—moves between rounds, opens and closes questions, adjusts scores, manages Players.
- Can open the **Roulette** view and the **Wheel of Adepts** view **repeatedly within a round** when cards call for them.
- Can start the **Lottery** to seat a new Player after Roulette.

**Player** — Sees the quiz board, can spin the Wheel of Adepts when allowed, and takes part in **Russian roulette** when that mini-game runs.

**Spectator** — Sees everything during rounds but **cannot** take Player-level actions. Before a **Lottery**, a Spectator may **opt out** so they will not be drawn as a new Player. Any Spectator may join **Spectator picks**. Someone becomes a Spectator after completing the **name entry** screen (viewer onboarding).

## Glossary

| Term | Meaning in this document |
| --- | --- |
| **Adepts game** | Quiz-show style game: rounds, board, cards, and three roles—Host, Player, Spectator. |
| **Host** | Runs the show: rounds, reveal of questions and answers, score changes, scripted transitions, and utility surfaces (e.g. **Roulette**, **Wheel of Adepts**). |
| **Player** | A contestant at the “table” (one of five numbered seats); opens cards, answers, and joins mini-games according to card rules. |
| **Player number** | Seat **1–5** on the Player strip; **turn** and **score** attach to the seat, not to a permanent person. |
| **Spectator** | Observer: chat, eligible mini-games (**Spectator picks**, opening show), optional opt-out before **Lottery**; during **main rounds**, no full Player actions. |
| **Round** | A phase of the main game with a **quiz board** (several **categories**, each with five **questions**). There are **three** rounds. |
| **Category** | A row or theme on the board; holds five **questions** with different **point values**. |
| **Question** | A board cell: text or media, a **point value** on the grid; selecting it opens a **question card**. |
| **Point value** | The score weight of a **question** (typical win/loss on a **standard card**), shown on the board. |
| **Question card** | The full-screen (or modal) experience: **prompt**, “show answer” (Host-only reveal), and a **type** (standard, wheel 1/3, Pandora, Raccoon, etc.). |
| **Quiz board** | The main grid of **categories** and **questions** within a **round**; Host and Player navigate between boards and **mini-games**. |
| **Turn** | The right to answer or pick the next **question**; on a wrong answer on a **standard card**, **turn** passes to the **Player on the right**. |
| **Score** | Points per **Player number**; the Host changes them via cards, direct entry, or **±** in steps of **100** as described above. |
| **Mini-game** | A separate mode: **Wheel of Adepts**, **Roulette**, **between-rounds** flow, **opening** emoji round, **Spectator picks**. |
| **Wheel of Adepts** | Spinning wheel with score sectors and **special sectors**; card variants—three spins with no question, or one spin after a correct answer on a **combined** card; outcome credited by Host or automation. **Several** runs may occur in one **round**. |
| **Roulette** | Revolver-style **mini-game** tied to **Pandora’s box**; eliminated **Player** → **Spectator**, then **Lottery** among Spectators for a new **Player**. **Several** runs may occur in one **round**. |
| **Lottery** | Random draw from a list the **Host** builds from **Spectators**, used after **Roulette** to assign a new **Player** to a seat. |
| **Pandora’s box** | **Question card** type that launches **Roulette**. |
| **“Raccoon in a sack”** | **Question card** type: current **Player** gives the **question** to another **Player** and does not answer. |
| **Between-rounds transition** | After **Round 2**: shared **story video**, then each **Player** enters **donated** points; values are stored and later **activated** in **Round 3** (×2 and **redistribution**). |
| **Story video** | Cinematic clip everyone sees between **Round 2** and **Round 3**, before donation entry. |
| **Opening the show** | **Mini-game** to select five **Players**: emoji wall + chat; **top five** by correct guesses get **seat numbers**. |
| **Donation (“good causes”)** | Points a **Player** voluntarily gives up in the **between-rounds** step (≤ current score, ≥ 0); stored as **stakes** for later **activation** in **Round 3**. |
| **Board stakes / activation** | Saved points from **donations**; **activate** when a specific **card** opens in **Round 3** (×2 and **redistribution**). |
| **Spectator picks** | **Mini-game** after **Players** are set but **before Round 1**; Spectators bet on a **Player number**; winners picked the **Player** with the highest **score** after **three rounds** (see **Spectator picks** section). |
| **Special sectors** | Wheel slices that are not simple add/subtract **score**: **Swap**, **Catch the thief**, **Wipe**, **Recite a poem**, etc. |
