/* The bundled horde decks, transcribed from the decklists at hordemagic.com.

   Each entry is {q: quantity, n: name, t: 1 if token}; everything else — art,
   rarity, rules text — is filled in from Scryfall the first time a deck is used,
   then cached offline.

   The order below is the order they appear on the decks screen, so a new deck
   goes in the group it belongs to rather than on the end. */

import zombiesHorde from "./decks/zombies-horde.json";
import vampireHorde from "./decks/vampire-horde.json";
import eldraziTitansHorde from "./decks/eldrazi-titans-horde.json";
import sliversHorde from "./decks/slivers-horde.json";
import angelsDemonsClericsAndDevils from "./decks/angels-demons-clerics-and-devils.json";
import angelsDemonsDemons from "./decks/angels-demons-demons.json";
import dDDungeonLv1Oozes from "./decks/d-d-dungeon-lv1-oozes.json";
import dDDungeonLv2GoblinsSkeletons from "./decks/d-d-dungeon-lv2-goblins-skeletons.json";
import dDDungeonLv3GiantsDragons from "./decks/d-d-dungeon-lv3-giants-dragons.json";
import bloomburrowRabbitWarren from "./decks/bloomburrow-rabbit-warren.json";
import bloomburrowBatCoven from "./decks/bloomburrow-bat-coven.json";
import bloomburrowSquirrelHoard from "./decks/bloomburrow-squirrel-hoard.json";
import bloomburrowRaccoonRuckus from "./decks/bloomburrow-raccoon-ruckus.json";
import bloomburrowDruidCircle from "./decks/bloomburrow-druid-circle.json";
import bloomburrowMouseBrigade from "./decks/bloomburrow-mouse-brigade.json";
import bloomburrowFrogPond from "./decks/bloomburrow-frog-pond.json";

export const BUNDLED_DECKS = [
  zombiesHorde,                 // Zombies Horde
  vampireHorde,                 // Vampire Horde
  eldraziTitansHorde,           // Eldrazi Titans Horde
  sliversHorde,                 // Slivers Horde
  angelsDemonsClericsAndDevils, // Angels & Demons — Clerics and Devils
  angelsDemonsDemons,           // Angels & Demons — Demons
  dDDungeonLv1Oozes,            // D&D Dungeon — Lv1 Oozes
  dDDungeonLv2GoblinsSkeletons, // D&D Dungeon — Lv2 Goblins & Skeletons
  dDDungeonLv3GiantsDragons,    // D&D Dungeon — Lv3 Giants & Dragons
  bloomburrowRabbitWarren,      // Bloomburrow — Rabbit Warren
  bloomburrowBatCoven,          // Bloomburrow — Bat Coven
  bloomburrowSquirrelHoard,     // Bloomburrow — Squirrel Hoard
  bloomburrowRaccoonRuckus,     // Bloomburrow — Raccoon Ruckus
  bloomburrowDruidCircle,       // Bloomburrow — Druid Circle
  bloomburrowMouseBrigade,      // Bloomburrow — Mouse Brigade
  bloomburrowFrogPond,          // Bloomburrow — Frog Pond
];
