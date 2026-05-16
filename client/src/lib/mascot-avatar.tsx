import { getMascotArchetype, type MascotArchetype } from "@/lib/mascot-archetypes";

export function getMascotAvatar(
  mascot: string | undefined,
  primaryColor: string,
  secondaryColor?: string,
): React.ReactNode {
  const archetype = mascot ? getMascotArchetype(mascot) : null;
  if (!archetype) return null;
  const acc = secondaryColor || "#ffffff";
  const det = primaryColor;
  return (
    <svg
      viewBox="0 0 32 32"
      width="80%"
      height="80%"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {renderArchetype(archetype, acc, det)}
    </svg>
  );
}

function renderArchetype(archetype: MascotArchetype, acc: string, det: string) {
  switch (archetype) {

    /* ── FELINES ─────────────────────────────────────────────────────────── */

    case "tiger":
      return (
        <>
          {/* Ears */}
          <polygon points="5,13 9,2 13,11" fill={acc} />
          <polygon points="27,13 23,2 19,11" fill={acc} />
          <polygon points="7,11 9,5 11,11" fill={det} />
          <polygon points="25,11 23,5 21,11" fill={det} />
          {/* Face */}
          <polygon points="6,11 10,8 22,8 26,11 27,22 25,28 22,31 10,31 7,28 5,22" fill={acc} />
          {/* Forehead stripes — key tiger feature */}
          <rect x="10" y="10" width="12" height="2" fill={det} />
          <rect x="11" y="13" width="10" height="2" fill={det} />
          {/* Eyes */}
          <rect x="9" y="16" width="5" height="4" fill={det} />
          <rect x="10" y="17" width="2" height="2" fill={acc} />
          <rect x="18" y="16" width="5" height="4" fill={det} />
          <rect x="19" y="17" width="2" height="2" fill={acc} />
          {/* Nose */}
          <polygon points="14,23 18,23 16,26" fill={det} />
          {/* Cheek stripes */}
          <rect x="5" y="21" width="4" height="2" fill={det} />
          <rect x="23" y="21" width="4" height="2" fill={det} />
        </>
      );

    case "wildcat":
      return (
        <>
          {/* Very sharp pointed ears */}
          <polygon points="4,14 8,0 14,12" fill={acc} />
          <polygon points="28,14 24,0 18,12" fill={acc} />
          <polygon points="6,13 8,4 12,13" fill={det} />
          <polygon points="26,13 24,4 20,13" fill={det} />
          {/* Angular face */}
          <polygon points="5,12 10,7 22,7 27,12 28,23 25,29 22,31 10,31 7,29 4,23" fill={acc} />
          {/* Eyes — angular/fierce */}
          <rect x="8" y="16" width="6" height="4" fill={det} />
          <rect x="9" y="17" width="3" height="2" fill={acc} />
          <rect x="18" y="16" width="6" height="4" fill={det} />
          <rect x="19" y="17" width="3" height="2" fill={acc} />
          {/* Snout / dark nose area */}
          <rect x="13" y="22" width="6" height="4" fill={det} />
          <rect x="15" y="23" width="2" height="2" fill={acc} />
          {/* Fangs — key wildcat distinguisher */}
          <rect x="11" y="26" width="3" height="5" fill="#ffffff" />
          <rect x="18" y="26" width="3" height="5" fill="#ffffff" />
        </>
      );

    case "panther":
      return (
        <>
          {/* Small sleek ears */}
          <polygon points="8,12 11,3 15,11" fill={acc} />
          <polygon points="24,12 21,3 17,11" fill={acc} />
          <polygon points="9,11 11,6 14,11" fill={det} />
          <polygon points="23,11 21,6 18,11" fill={det} />
          {/* Narrow, elongated face — key panther feature */}
          <polygon points="8,11 11,8 21,8 24,11 25,20 23,27 19,30 13,30 9,27 7,20" fill={acc} />
          {/* Eyes — bright/intense */}
          <rect x="9" y="14" width="5" height="5" fill={det} />
          <rect x="10" y="15" width="2" height="3" fill={acc} />
          <rect x="18" y="14" width="5" height="5" fill={det} />
          <rect x="19" y="15" width="2" height="3" fill={acc} />
          {/* Long narrow nose bridge */}
          <rect x="15" y="19" width="2" height="4" fill={det} />
          {/* Muzzle */}
          <polygon points="12,22 20,22 20,26 16,29 12,26" fill={det} />
          <rect x="13" y="23" width="3" height="2" fill={acc} />
          <rect x="16" y="23" width="3" height="2" fill={acc} />
        </>
      );

    case "lion":
      return (
        <>
          {/* MANE — the key lion feature (large surrounding polygon) */}
          <polygon points="3,13 5,7 10,3 16,1 22,3 27,7 29,13 30,20 27,26 22,30 16,32 10,30 5,26 2,20" fill={det} />
          {/* Face (inner circle) */}
          <polygon points="8,15 10,11 22,11 24,15 24,22 22,26 16,28 10,26 8,22" fill={acc} />
          {/* Ear tips peeking above mane */}
          <polygon points="9,12 11,7 13,12" fill={acc} />
          <polygon points="23,12 21,7 19,12" fill={acc} />
          {/* Eyes */}
          <rect x="10" y="16" width="4" height="4" fill={det} />
          <rect x="11" y="17" width="2" height="2" fill={acc} />
          <rect x="18" y="16" width="4" height="4" fill={det} />
          <rect x="19" y="17" width="2" height="2" fill={acc} />
          {/* Big nose */}
          <rect x="14" y="21" width="4" height="3" fill={det} />
          {/* Wide muzzle */}
          <rect x="11" y="23" width="10" height="4" fill={det} />
          <rect x="12" y="24" width="3" height="2" fill={acc} />
          <rect x="17" y="24" width="3" height="2" fill={acc} />
        </>
      );

    case "cougar":
      return (
        <>
          {/* Medium ears */}
          <polygon points="5,13 9,3 13,12" fill={acc} />
          <polygon points="27,13 23,3 19,12" fill={acc} />
          <polygon points="7,12 9,6 11,12" fill={det} />
          <polygon points="25,12 23,6 21,12" fill={det} />
          {/* Face — medium proportions */}
          <polygon points="5,12 10,8 22,8 27,12 28,22 26,28 22,31 10,31 6,28 4,22" fill={acc} />
          {/* Two-tone muzzle — key cougar feature */}
          <polygon points="12,21 20,21 20,28 16,30 12,28" fill="#ffffff" />
          {/* Eyes */}
          <rect x="9" y="15" width="5" height="5" fill={det} />
          <rect x="10" y="16" width="2" height="2" fill={acc} />
          <rect x="18" y="15" width="5" height="5" fill={det} />
          <rect x="19" y="16" width="2" height="2" fill={acc} />
          {/* Nose on muzzle */}
          <rect x="15" y="21" width="2" height="2" fill={det} />
        </>
      );

    /* ── CANINES ─────────────────────────────────────────────────────────── */

    case "bulldog":
      return (
        <>
          {/* Short round ears */}
          <polygon points="3,13 6,8 11,14" fill={acc} />
          <polygon points="29,13 26,8 21,14" fill={acc} />
          {/* Wide stocky head */}
          <polygon points="4,13 8,8 24,8 28,13 28,22 25,26 22,28 10,28 7,26 4,22" fill={acc} />
          {/* Wrinkle lines on forehead */}
          <rect x="10" y="12" width="4" height="1" fill={det} />
          <rect x="18" y="12" width="4" height="1" fill={det} />
          {/* Eyes — set wide */}
          <rect x="8" y="15" width="5" height="4" fill={det} />
          <rect x="9" y="16" width="2" height="2" fill={acc} />
          <rect x="19" y="15" width="5" height="4" fill={det} />
          <rect x="20" y="16" width="2" height="2" fill={acc} />
          {/* Wide nose/jowl area — key bulldog feature */}
          <rect x="8" y="21" width="16" height="10" fill={det} />
          {/* Jowls extending extra wide */}
          <rect x="4" y="22" width="5" height="8" fill={acc} />
          <rect x="23" y="22" width="5" height="8" fill={acc} />
          {/* Underbite teeth */}
          <rect x="10" y="27" width="3" height="4" fill="#ffffff" />
          <rect x="14" y="27" width="4" height="4" fill="#ffffff" />
          <rect x="19" y="27" width="3" height="4" fill="#ffffff" />
          {/* Nostrils */}
          <rect x="13" y="23" width="2" height="2" fill={acc} />
          <rect x="17" y="23" width="2" height="2" fill={acc} />
        </>
      );

    case "wolf":
      return (
        <>
          {/* Tall pointed ears */}
          <polygon points="4,15 8,1 13,13" fill={acc} />
          <polygon points="28,15 24,1 19,13" fill={acc} />
          <polygon points="6,14 8,5 11,13" fill={det} />
          <polygon points="26,14 24,5 21,13" fill={det} />
          {/* Narrower head */}
          <polygon points="5,13 9,9 23,9 27,13 28,22 25,28 22,31 10,31 7,28 4,22" fill={acc} />
          {/* Eyes */}
          <rect x="9" y="16" width="5" height="4" fill={det} />
          <rect x="10" y="17" width="2" height="2" fill={acc} />
          <rect x="18" y="16" width="5" height="4" fill={det} />
          <rect x="19" y="17" width="2" height="2" fill={acc} />
          {/* Long pointed snout — key wolf feature */}
          <polygon points="12,22 20,22 20,31 16,32 12,31" fill={det} />
          <rect x="13" y="23" width="6" height="5" fill={acc} />
          {/* Nose tip */}
          <rect x="15" y="28" width="2" height="3" fill={det} />
        </>
      );

    case "husky":
      return (
        <>
          {/* Pointed ears */}
          <polygon points="5,14 9,2 13,12" fill={acc} />
          <polygon points="27,14 23,2 19,12" fill={acc} />
          <polygon points="7,13 9,5 11,13" fill={det} />
          <polygon points="25,13 23,5 21,13" fill={det} />
          {/* Face */}
          <polygon points="5,12 9,8 23,8 27,12 28,22 26,28 22,31 10,31 6,28 4,22" fill={acc} />
          {/* Eye MASK — key husky distinguisher (dark patches around eyes) */}
          <rect x="8" y="14" width="7" height="7" fill={det} />
          <rect x="9" y="15" width="4" height="4" fill={acc} />
          <rect x="10" y="16" width="2" height="2" fill={det} />
          <rect x="17" y="14" width="7" height="7" fill={det} />
          <rect x="18" y="15" width="4" height="4" fill={acc} />
          <rect x="19" y="16" width="2" height="2" fill={det} />
          {/* White muzzle area */}
          <polygon points="12,22 20,22 20,29 16,31 12,29" fill="#ffffff" />
          {/* Nose */}
          <rect x="15" y="22" width="2" height="2" fill={det} />
        </>
      );

    case "wolverine":
      return (
        <>
          {/* Wide stocky body/head */}
          <polygon points="3,12 7,7 25,7 29,12 30,21 28,27 24,30 8,30 4,27 2,21" fill={acc} />
          {/* Small round ears */}
          <polygon points="4,13 6,7 10,12" fill={acc} />
          <polygon points="28,13 26,7 22,12" fill={acc} />
          {/* Dark MASK stripe across eye area — key wolverine feature */}
          <rect x="2" y="14" width="28" height="7" fill={det} />
          {/* Eyes within mask */}
          <rect x="9" y="15" width="4" height="4" fill={acc} />
          <rect x="10" y="16" width="2" height="2" fill={det} />
          <rect x="19" y="15" width="4" height="4" fill={acc} />
          <rect x="20" y="16" width="2" height="2" fill={det} />
          {/* Snout below mask */}
          <rect x="12" y="22" width="8" height="6" fill={det} />
          <rect x="13" y="23" width="2" height="3" fill={acc} />
          <rect x="17" y="23" width="2" height="3" fill={acc} />
          {/* Nose */}
          <rect x="15" y="22" width="2" height="2" fill={acc} />
        </>
      );

    /* ── RAPTORS / BIRDS ─────────────────────────────────────────────────── */

    case "eagle":
      return (
        <>
          {/* Head shape */}
          <polygon points="8,6 16,2 24,6 27,12 26,20 22,26 16,29 10,26 6,20 5,12" fill={acc} />
          {/* Prominent curved/hooked beak — key eagle feature */}
          <polygon points="16,18 24,16 26,20 22,24 16,22" fill={det} />
          <polygon points="16,20 22,18 23,21 19,23 16,21" fill={acc} />
          {/* Eye — strong, with surrounding feather ring */}
          <rect x="8" y="13" width="8" height="7" fill={det} />
          <rect x="9" y="14" width="5" height="5" fill={acc} />
          <rect x="10" y="15" width="3" height="3" fill={det} />
          <rect x="11" y="16" width="1" height="1" fill="#ffffff" />
          {/* Head feathers on top */}
          <rect x="11" y="4" width="2" height="4" fill={det} />
          <rect x="14" y="3" width="2" height="4" fill={det} />
          <rect x="17" y="4" width="2" height="4" fill={det} />
          {/* Wing hint */}
          <polygon points="2,18 6,14 6,22" fill={det} />
          <polygon points="30,18 26,14 26,22" fill={det} />
        </>
      );

    case "hawk":
      return (
        <>
          {/* Head */}
          <polygon points="9,7 16,3 23,7 26,13 24,20 20,25 16,27 12,25 8,20 6,13" fill={acc} />
          {/* Eye ring — key hawk identifier */}
          <rect x="7" y="13" width="9" height="8" fill={det} />
          <rect x="8" y="14" width="6" height="6" fill={acc} />
          <rect x="9" y="15" width="4" height="4" fill={det} />
          <rect x="10" y="16" width="2" height="2" fill={acc} />
          {/* Curved beak (smaller than eagle) */}
          <polygon points="16,19 22,17 23,21 19,23 16,21" fill={det} />
          <polygon points="16,20 21,18 22,21 18,22 16,21" fill={acc} />
          {/* Crown feathers */}
          <rect x="13" y="4" width="2" height="4" fill={det} />
          <rect x="16" y="3" width="2" height="4" fill={det} />
          {/* Wing hints angled */}
          <polygon points="2,20 7,15 7,23" fill={det} />
          <polygon points="30,20 25,15 25,23" fill={det} />
        </>
      );

    case "owl":
      return (
        <>
          {/* Round head */}
          <polygon points="5,10 10,5 22,5 27,10 28,18 25,24 20,28 12,28 7,24 4,18" fill={acc} />
          {/* Small ear tufts */}
          <polygon points="9,8 11,3 13,8" fill={acc} />
          <polygon points="23,8 21,3 19,8" fill={acc} />
          {/* HUGE circular eyes — the defining owl feature */}
          <rect x="6" y="11" width="9" height="10" fill={det} />
          <rect x="7" y="12" width="7" height="8" fill={acc} />
          <rect x="8" y="13" width="5" height="6" fill={det} />
          <rect x="9" y="14" width="3" height="4" fill={acc} />
          <rect x="10" y="15" width="1" height="2" fill={det} />
          <rect x="17" y="11" width="9" height="10" fill={det} />
          <rect x="18" y="12" width="7" height="8" fill={acc} />
          <rect x="19" y="13" width="5" height="6" fill={det} />
          <rect x="20" y="14" width="3" height="4" fill={acc} />
          <rect x="21" y="15" width="1" height="2" fill={det} />
          {/* Small beak between large eyes */}
          <polygon points="14,21 18,21 16,25" fill={det} />
          <polygon points="15,21 17,21 16,23" fill={acc} />
        </>
      );

    case "gamecock":
      return (
        <>
          {/* Body */}
          <polygon points="8,14 14,8 20,8 25,13 26,22 22,28 16,31 10,28 6,22" fill={acc} />
          {/* COMB on top — key gamecock feature */}
          <polygon points="11,9 13,3 15,8 17,2 19,8 21,5 22,10 11,10" fill="#cc2200" />
          {/* Eye */}
          <rect x="10" y="14" width="5" height="5" fill={det} />
          <rect x="11" y="15" width="3" height="3" fill={acc} />
          <rect x="12" y="16" width="1" height="1" fill={det} />
          {/* Beak */}
          <polygon points="17,16 22,15 22,19 17,18" fill={det} />
          <polygon points="18,17 22,16 22,18 18,18" fill="#ffaa00" />
          {/* Wattle below beak */}
          <polygon points="17,19 21,19 20,24 17,24" fill="#cc2200" />
          {/* Tail feathers */}
          <polygon points="4,20 7,17 8,25" fill={det} />
          <polygon points="2,22 6,19 7,28" fill={acc} />
        </>
      );

    case "cardinal_bird":
      return (
        <>
          {/* Body */}
          <polygon points="8,14 14,10 22,10 26,16 25,24 20,29 12,29 7,24" fill={acc} />
          {/* CREST — key cardinal feature (pointed cone on top of head) */}
          <polygon points="14,10 16,1 18,10" fill={acc} />
          <polygon points="15,10 16,4 17,10" fill={det} />
          {/* Eye ring */}
          <rect x="9" y="15" width="6" height="6" fill={det} />
          <rect x="10" y="16" width="4" height="4" fill={acc} />
          <rect x="11" y="17" width="2" height="2" fill={det} />
          {/* Short cone beak */}
          <polygon points="16,18 22,16 22,20 16,21" fill={det} />
          <polygon points="16,18 21,17 21,19 16,20" fill="#ffaa00" />
          {/* Wing detail */}
          <rect x="7" y="18" width="3" height="8" fill={det} />
          <polygon points="4,22 8,18 8,28" fill={acc} />
        </>
      );

    case "duck":
      return (
        <>
          {/* Round head */}
          <polygon points="8,7 16,3 24,7 27,14 24,21 19,26 13,26 8,21 5,14" fill={acc} />
          {/* FLAT BILL — key duck feature */}
          <polygon points="10,18 22,16 24,20 22,24 10,22" fill="#ff8800" />
          <polygon points="10,20 22,18 23,21 22,23 10,22" fill="#ffaa00" />
          {/* Eye */}
          <rect x="9" y="13" width="5" height="5" fill={det} />
          <rect x="10" y="14" width="3" height="3" fill="#ffffff" />
          <rect x="10" y="14" width="2" height="2" fill={det} />
          {/* Body below head */}
          <polygon points="6,22 10,20 22,20 26,22 26,30 6,30" fill={acc} />
          {/* Wing on body */}
          <polygon points="7,24 12,22 12,29 7,29" fill={det} />
        </>
      );

    case "falcon":
      return (
        <>
          {/* Wings spread wide — key falcon feature (pointed tips) */}
          <polygon points="0,14 8,10 12,18 4,22" fill={acc} />
          <polygon points="32,14 24,10 20,18 28,22" fill={acc} />
          {/* Body center */}
          <polygon points="11,8 16,5 21,8 23,18 20,26 16,28 12,26 9,18" fill={acc} />
          {/* Head */}
          <rect x="12" y="5" width="8" height="8" fill={det} />
          {/* Eye */}
          <rect x="13" y="7" width="3" height="3" fill={acc} />
          <rect x="14" y="8" width="1" height="1" fill={det} />
          {/* Hooked falcon beak */}
          <polygon points="16,10 21,9 21,13 17,13" fill={det} />
          <polygon points="16,11 20,10 20,12 16,12" fill="#ffaa00" />
          {/* Wing secondary feathers */}
          <rect x="3" y="17" width="7" height="3" fill={det} />
          <rect x="22" y="17" width="7" height="3" fill={det} />
        </>
      );

    /* ── BEARS ───────────────────────────────────────────────────────────── */

    case "bear":
      return (
        <>
          {/* Round ears — bear's round ears distinguish from cats */}
          <rect x="3" y="4" width="9" height="9" fill={acc} />
          <rect x="5" y="6" width="5" height="5" fill={det} />
          <rect x="20" y="4" width="9" height="9" fill={acc} />
          <rect x="22" y="6" width="5" height="5" fill={det} />
          {/* Broad face */}
          <polygon points="4,11 8,7 24,7 28,11 29,23 26,28 22,31 10,31 6,28 3,23" fill={acc} />
          {/* Eyes */}
          <rect x="8" y="14" width="5" height="5" fill={det} />
          <rect x="9" y="15" width="3" height="3" fill={acc} />
          <rect x="10" y="16" width="1" height="1" fill={det} />
          <rect x="19" y="14" width="5" height="5" fill={det} />
          <rect x="20" y="15" width="3" height="3" fill={acc} />
          <rect x="21" y="16" width="1" height="1" fill={det} />
          {/* Bear snout */}
          <rect x="11" y="21" width="10" height="9" fill={det} />
          <rect x="12" y="22" width="4" height="4" fill={acc} />
          <rect x="16" y="22" width="4" height="4" fill={acc} />
          {/* Nose */}
          <rect x="14" y="21" width="4" height="3" fill={acc} />
        </>
      );

    case "badger":
      return (
        <>
          {/* Wide low head — badgers are wide and low */}
          <polygon points="2,12 6,8 26,8 30,12 30,24 26,28 6,28 2,24" fill={acc} />
          {/* Small ears */}
          <polygon points="4,10 7,5 10,10" fill={acc} />
          <polygon points="28,10 25,5 22,10" fill={acc} />
          {/* WHITE STRIPE from nose to top of head — the definitive badger feature */}
          <rect x="14" y="4" width="4" height="24" fill="#ffffff" />
          {/* Dark face sides */}
          <rect x="2" y="10" width="12" height="14" fill={det} />
          <rect x="18" y="10" width="12" height="14" fill={det} />
          {/* Eyes in dark side area */}
          <rect x="5" y="13" width="5" height="4" fill={acc} />
          <rect x="6" y="14" width="3" height="2" fill={det} />
          <rect x="22" y="13" width="5" height="4" fill={acc} />
          <rect x="23" y="14" width="3" height="2" fill={det} />
          {/* Nose */}
          <rect x="15" y="22" width="2" height="2" fill={det} />
        </>
      );

    case "beaver":
      return (
        <>
          {/* Round face */}
          <polygon points="7,8 16,4 25,8 28,16 26,24 22,28 16,30 10,28 6,24 4,16" fill={acc} />
          {/* Small round ears */}
          <rect x="4" y="6" width="6" height="6" fill={acc} />
          <rect x="5" y="7" width="4" height="4" fill={det} />
          <rect x="22" y="6" width="6" height="6" fill={acc} />
          <rect x="23" y="7" width="4" height="4" fill={det} />
          {/* Eyes */}
          <rect x="9" y="13" width="5" height="4" fill={det} />
          <rect x="10" y="14" width="3" height="2" fill={acc} />
          <rect x="18" y="13" width="5" height="4" fill={det} />
          <rect x="19" y="14" width="3" height="2" fill={acc} />
          {/* PROMINENT FRONT TEETH — key beaver feature */}
          <rect x="13" y="21" width="3" height="9" fill="#ffffff" />
          <rect x="16" y="21" width="1" height="9" fill={det} />
          <rect x="17" y="21" width="3" height="9" fill="#ffffff" />
          {/* FLAT PADDLE TAIL at bottom */}
          <polygon points="6,29 26,29 28,32 4,32" fill={det} />
          {/* Tail texture lines */}
          <rect x="8" y="30" width="16" height="1" fill={acc} />
        </>
      );

    /* ── WARRIORS ────────────────────────────────────────────────────────── */

    case "knight_spartan":
      return (
        <>
          {/* HELMET — the key spartan/knight feature */}
          {/* Helmet crest/plume on top */}
          <rect x="14" y="0" width="4" height="5" fill={acc} />
          <rect x="13" y="5" width="6" height="2" fill={det} />
          {/* Helmet dome */}
          <polygon points="6,7 10,3 22,3 26,7 28,14 28,22 26,26 6,26 4,22 4,14" fill={det} />
          {/* VISOR SLIT — key knight identifier */}
          <rect x="7" y="15" width="18" height="4" fill={acc} />
          <rect x="8" y="16" width="16" height="2" fill={det} />
          {/* Cheek guards */}
          <rect x="4" y="18" width="4" height="8" fill={det} />
          <rect x="24" y="18" width="4" height="8" fill={det} />
          {/* Neck guard */}
          <rect x="8" y="24" width="16" height="5" fill={det} />
          {/* Chin strap */}
          <rect x="6" y="22" width="20" height="3" fill={acc} />
        </>
      );

    case "cowboy":
      return (
        <>
          {/* WIDE BRIMMED HAT — the defining cowboy feature */}
          {/* Hat brim (extra wide) */}
          <polygon points="0,13 32,13 30,17 2,17" fill={det} />
          {/* Hat crown */}
          <polygon points="7,13 9,3 23,3 25,13" fill={det} />
          {/* Hat band */}
          <rect x="8" y="11" width="16" height="3" fill={acc} />
          {/* Hat indent at top */}
          <rect x="13" y="3" width="6" height="2" fill={acc} />
          {/* Face below brim */}
          <polygon points="8,17 12,15 20,15 24,17 24,26 20,30 12,30 8,26" fill={acc} />
          {/* Eyes */}
          <rect x="10" y="18" width="4" height="4" fill={det} />
          <rect x="11" y="19" width="2" height="2" fill={acc} />
          <rect x="18" y="18" width="4" height="4" fill={det} />
          <rect x="19" y="19" width="2" height="2" fill={acc} />
          {/* Simple mouth / chin */}
          <rect x="13" y="24" width="6" height="2" fill={det} />
        </>
      );

    case "native_warrior":
      return (
        <>
          {/* HEADDRESS FEATHERS — the key native warrior feature */}
          <rect x="12" y="0" width="3" height="10" fill={acc} />
          <rect x="16" y="0" width="3" height="12" fill={det} />
          <rect x="20" y="1" width="3" height="10" fill={acc} />
          <rect x="8" y="2" width="3" height="9" fill={det} />
          <rect x="24" y="3" width="3" height="8" fill={acc} />
          <rect x="4" y="5" width="3" height="7" fill={det} />
          {/* Headband */}
          <rect x="5" y="11" width="22" height="4" fill={det} />
          <rect x="6" y="12" width="20" height="2" fill={acc} />
          {/* Face */}
          <polygon points="7,15 10,13 22,13 25,15 26,24 22,29 10,29 6,24" fill={acc} />
          {/* Eyes */}
          <rect x="9" y="17" width="5" height="4" fill={det} />
          <rect x="10" y="18" width="3" height="2" fill={acc} />
          <rect x="18" y="17" width="5" height="4" fill={det} />
          <rect x="19" y="18" width="3" height="2" fill={acc} />
          {/* Nose + simple face details */}
          <rect x="15" y="22" width="2" height="2" fill={det} />
          <rect x="11" y="24" width="10" height="2" fill={det} />
        </>
      );

    case "pirate":
      return (
        <>
          {/* SKULL — the pirate identifier */}
          {/* Skull dome */}
          <polygon points="6,10 10,4 22,4 26,10 28,18 24,22 8,22 4,18" fill="#f0f0e0" />
          {/* Eye sockets — hollow and dark */}
          <rect x="7" y="12" width="7" height="7" fill="#111111" />
          <rect x="18" y="12" width="7" height="7" fill="#111111" />
          {/* Skull teeth */}
          <rect x="8" y="21" width="16" height="3" fill="#f0f0e0" />
          <rect x="10" y="21" width="2" height="5" fill="#f0f0e0" />
          <rect x="14" y="21" width="2" height="5" fill="#f0f0e0" />
          <rect x="18" y="21" width="2" height="5" fill="#f0f0e0" />
          {/* CROSSBONES */}
          <polygon points="2,24 10,28 8,30 0,26" fill="#f0f0e0" />
          <polygon points="30,24 22,28 24,30 32,26" fill="#f0f0e0" />
          <polygon points="2,30 10,26 8,24 0,28" fill="#f0f0e0" />
          <polygon points="30,30 22,26 24,24 32,28" fill="#f0f0e0" />
          {/* Pirate hat on top */}
          <polygon points="4,10 16,2 28,10" fill={det} />
          <rect x="6" y="8" width="20" height="4" fill={det} />
        </>
      );

    case "mountaineer":
      return (
        <>
          {/* Mountain silhouette behind figure */}
          <polygon points="0,30 8,10 14,18 16,12 18,18 24,10 32,30" fill={det} />
          {/* Figure silhouette */}
          <polygon points="12,10 16,2 20,10 21,22 11,22" fill={acc} />
          {/* Coonskin cap */}
          <polygon points="11,10 16,2 21,10 21,7 16,5 11,7" fill={det} />
          {/* Face area */}
          <rect x="12" y="12" width="8" height="7" fill={acc} />
          {/* Eyes */}
          <rect x="13" y="13" width="2" height="2" fill={det} />
          <rect x="17" y="13" width="2" height="2" fill={det} />
          {/* Rifle / axe diagonal line */}
          <rect x="2" y="5" width="3" height="20" fill={acc} transform="rotate(-15 10 16)" />
        </>
      );

    /* ── BOVINES ─────────────────────────────────────────────────────────── */

    case "longhorn":
      return (
        <>
          {/* VERY WIDE HORNS — the defining longhorn feature */}
          <polygon points="0,14 4,8 10,12 8,18" fill={acc} />
          <polygon points="32,14 28,8 22,12 24,18" fill={acc} />
          <polygon points="1,13 4,9 8,13" fill={det} />
          <polygon points="31,13 28,9 24,13" fill={det} />
          {/* Face (narrower between the huge horns) */}
          <polygon points="9,11 13,8 19,8 23,11 24,20 22,26 19,30 13,30 10,26 8,20" fill={acc} />
          {/* Eyes */}
          <rect x="10" y="14" width="5" height="4" fill={det} />
          <rect x="11" y="15" width="3" height="2" fill={acc} />
          <rect x="17" y="14" width="5" height="4" fill={det} />
          <rect x="18" y="15" width="3" height="2" fill={acc} />
          {/* Wide nostrils / nose */}
          <rect x="12" y="22" width="8" height="6" fill={det} />
          <rect x="13" y="23" width="2" height="3" fill={acc} />
          <rect x="17" y="23" width="2" height="3" fill={acc} />
        </>
      );

    case "ram_mustang":
      return (
        <>
          {/* Face */}
          <polygon points="8,11 12,7 20,7 24,11 25,22 22,28 16,31 10,28 7,22" fill={acc} />
          {/* CURLED HORNS — the ram identifier */}
          {/* Left curled horn */}
          <polygon points="3,8 8,4 12,10 10,16 6,18 3,14" fill={acc} />
          <polygon points="5,9 8,6 11,11 9,15 6,16 4,13" fill={det} />
          {/* Right curled horn */}
          <polygon points="29,8 24,4 20,10 22,16 26,18 29,14" fill={acc} />
          <polygon points="27,9 24,6 21,11 23,15 26,16 28,13" fill={det} />
          {/* Eyes */}
          <rect x="9" y="14" width="5" height="4" fill={det} />
          <rect x="10" y="15" width="3" height="2" fill={acc} />
          <rect x="18" y="14" width="5" height="4" fill={det} />
          <rect x="19" y="15" width="3" height="2" fill={acc} />
          {/* Snout */}
          <rect x="12" y="22" width="8" height="8" fill={det} />
          <rect x="13" y="23" width="6" height="5" fill={acc} />
          <rect x="14" y="24" width="2" height="2" fill={det} />
          <rect x="16" y="24" width="2" height="2" fill={det} />
        </>
      );

    case "bison_buffalo":
      return (
        <>
          {/* HUMP — the defining bison feature (shows as extra bulk on top/back) */}
          <polygon points="3,8 10,4 18,6 18,16 3,16" fill={acc} />
          {/* Main head (front-facing) */}
          <polygon points="4,14 10,10 22,10 28,14 29,24 26,29 22,32 10,32 6,29 3,24" fill={acc} />
          {/* Shaggy forehead — dark shaggy hair */}
          <polygon points="6,14 10,10 22,10 26,14 26,20 6,20" fill={det} />
          {/* Short upward horns */}
          <polygon points="6,13 4,6 9,11" fill={acc} />
          <polygon points="26,13 28,6 23,11" fill={acc} />
          {/* Eyes within shaggy area */}
          <rect x="9" y="15" width="4" height="4" fill={acc} />
          <rect x="10" y="16" width="2" height="2" fill={det} />
          <rect x="19" y="15" width="4" height="4" fill={acc} />
          <rect x="20" y="16" width="2" height="2" fill={det} />
          {/* Snout below shaggy area */}
          <rect x="10" y="22" width="12" height="8" fill={det} />
          <rect x="11" y="23" width="4" height="4" fill={acc} />
          <rect x="17" y="23" width="4" height="4" fill={acc} />
          {/* Nostrils */}
          <rect x="13" y="25" width="2" height="2" fill={det} />
          <rect x="17" y="25" width="2" height="2" fill={det} />
        </>
      );

    case "razorback":
      return (
        <>
          {/* DORSAL BRISTLE RIDGE on top — key razorback feature */}
          <rect x="7" y="1" width="4" height="7" fill={acc} />
          <rect x="12" y="0" width="4" height="9" fill={det} />
          <rect x="17" y="1" width="4" height="7" fill={acc} />
          <rect x="22" y="2" width="3" height="6" fill={det} />
          <rect x="5" y="3" width="3" height="5" fill={det} />
          {/* Wide boar head */}
          <polygon points="5,8 9,6 23,6 27,8 28,20 25,26 22,29 10,29 7,26 4,20" fill={acc} />
          {/* Small ears */}
          <polygon points="5,10 7,6 10,10" fill={acc} />
          <polygon points="27,10 25,6 22,10" fill={acc} />
          {/* Eyes */}
          <rect x="8" y="13" width="5" height="4" fill={det} />
          <rect x="9" y="14" width="3" height="2" fill={acc} />
          <rect x="19" y="13" width="5" height="4" fill={det} />
          <rect x="20" y="14" width="3" height="2" fill={acc} />
          {/* Wide flat snout */}
          <rect x="9" y="20" width="14" height="8" fill={det} />
          <rect x="10" y="21" width="5" height="4" fill={acc} />
          <rect x="17" y="21" width="5" height="4" fill={acc} />
          {/* TUSKS */}
          <rect x="8" y="22" width="3" height="6" fill="#ffffff" />
          <rect x="21" y="22" width="3" height="6" fill="#ffffff" />
        </>
      );

    /* ── REPTILES ────────────────────────────────────────────────────────── */

    case "horned_frog":
      return (
        <>
          {/* HORNS on top — the key horned frog feature */}
          <rect x="9" y="0" width="3" height="7" fill={acc} />
          <rect x="14" y="0" width="3" height="8" fill={det} />
          <rect x="19" y="0" width="3" height="7" fill={acc} />
          <rect x="6" y="2" width="2" height="6" fill={det} />
          <rect x="23" y="2" width="2" height="6" fill={acc} />
          {/* Wide flat head — horned frogs are very wide and flat */}
          <polygon points="2,8 6,6 26,6 30,8 31,16 28,20 22,22 10,22 4,20 1,16" fill={acc} />
          {/* Eyes (on sides of head, as frogs have) */}
          <rect x="3" y="9" width="6" height="6" fill={det} />
          <rect x="4" y="10" width="4" height="4" fill={acc} />
          <rect x="5" y="11" width="2" height="2" fill={det} />
          <rect x="23" y="9" width="6" height="6" fill={det} />
          <rect x="24" y="10" width="4" height="4" fill={acc} />
          <rect x="25" y="11" width="2" height="2" fill={det} />
          {/* Wide mouth line */}
          <rect x="6" y="17" width="20" height="3" fill={det} />
          {/* Body wide below */}
          <polygon points="4,22 28,22 30,28 25,32 7,32 2,28" fill={acc} />
        </>
      );

    case "gator":
      return (
        <>
          {/* VERY WIDE FLAT SNOUT — the defining gator feature */}
          <polygon points="0,16 4,12 28,12 32,16 30,22 28,26 4,26 2,22" fill={acc} />
          {/* Top of head above snout */}
          <polygon points="6,12 10,6 22,6 26,12" fill={acc} />
          {/* TEETH along jaw edges */}
          <rect x="5" y="10" width="2" height="4" fill="#ffffff" />
          <rect x="9" y="10" width="2" height="4" fill="#ffffff" />
          <rect x="13" y="10" width="2" height="4" fill="#ffffff" />
          <rect x="17" y="10" width="2" height="4" fill="#ffffff" />
          <rect x="21" y="10" width="2" height="4" fill="#ffffff" />
          <rect x="25" y="10" width="2" height="4" fill="#ffffff" />
          {/* Eyes on top of head */}
          <rect x="9" y="7" width="5" height="5" fill={det} />
          <rect x="10" y="8" width="3" height="3" fill={acc} />
          <rect x="11" y="9" width="1" height="1" fill={det} />
          <rect x="18" y="7" width="5" height="5" fill={det} />
          <rect x="19" y="8" width="3" height="3" fill={acc} />
          <rect x="20" y="9" width="1" height="1" fill={det} />
          {/* Nostrils */}
          <rect x="13" y="14" width="3" height="3" fill={det} />
          <rect x="17" y="14" width="3" height="3" fill={det} />
          {/* Scales pattern on body */}
          <rect x="4" y="22" width="4" height="3" fill={det} />
          <rect x="10" y="22" width="4" height="3" fill={det} />
          <rect x="16" y="22" width="4" height="3" fill={det} />
          <rect x="22" y="22" width="4" height="3" fill={det} />
        </>
      );

    case "terrapin":
      return (
        <>
          {/* Small head poking out */}
          <polygon points="11,4 16,1 21,4 22,9 10,9" fill={acc} />
          {/* Eye */}
          <rect x="12" y="5" width="3" height="3" fill={det} />
          <rect x="13" y="6" width="1" height="1" fill={acc} />
          {/* SHELL — the key terrapin feature (hexagonal pattern) */}
          <polygon points="4,9 28,9 30,16 28,26 22,30 10,30 4,26 2,16" fill={acc} />
          {/* Hexagonal shell segments */}
          <rect x="12" y="11" width="8" height="6" fill={det} />
          <rect x="6" y="13" width="6" height="6" fill={det} />
          <rect x="20" y="13" width="6" height="6" fill={det} />
          <rect x="10" y="19" width="6" height="6" fill={det} />
          <rect x="16" y="19" width="6" height="6" fill={det} />
          {/* Shell border highlights */}
          <rect x="13" y="12" width="6" height="4" fill={acc} />
          <rect x="7" y="14" width="4" height="4" fill={acc} />
          <rect x="21" y="14" width="4" height="4" fill={acc} />
          <rect x="11" y="20" width="4" height="4" fill={acc} />
          <rect x="17" y="20" width="4" height="4" fill={acc} />
          {/* Legs */}
          <rect x="4" y="24" width="4" height="6" fill={acc} />
          <rect x="24" y="24" width="4" height="6" fill={acc} />
        </>
      );

    case "rattler":
      return (
        <>
          {/* COILED SNAKE BODY — key rattler feature */}
          {/* Outer coil */}
          <polygon points="2,14 4,6 10,2 18,2 24,6 28,12 28,20 24,26 18,30 10,30 4,26 2,20" fill={acc} />
          {/* Middle coil */}
          <polygon points="6,16 7,10 12,7 20,7 24,12 24,18 20,23 12,23 8,18" fill={det} />
          {/* Inner coil */}
          <polygon points="10,16 11,12 14,10 18,11 20,14 20,18 17,21 13,20 11,18" fill={acc} />
          {/* Diamond pattern on outer coil */}
          <rect x="3" y="12" width="3" height="4" fill={det} />
          <rect x="26" y="12" width="3" height="4" fill={det} />
          <rect x="11" y="2" width="4" height="3" fill={det} />
          <rect x="14" y="27" width="4" height="3" fill={det} />
          {/* TRIANGULAR HEAD */}
          <polygon points="20,8 28,6 30,12 24,14 20,12" fill={acc} />
          {/* Eye on head */}
          <rect x="23" y="8" width="3" height="3" fill={det} />
          <rect x="24" y="9" width="1" height="1" fill="#ff0000" />
          {/* Forked tongue */}
          <rect x="28" y="10" width="4" height="1" fill="#cc0000" />
          <rect x="30" y="9" width="1" height="2" fill="#cc0000" />
          <rect x="31" y="11" width="1" height="2" fill="#cc0000" />
          {/* Rattle at tail */}
          <rect x="10" y="12" width="4" height="6" fill={det} />
          <rect x="11" y="13" width="2" height="4" fill="#cccccc" />
        </>
      );

    /* ── SPECIAL ─────────────────────────────────────────────────────────── */

    case "insect":
      return (
        <>
          {/* Wings — wider than body */}
          <polygon points="2,10 0,18 10,18 12,10" fill={acc} />
          <polygon points="30,10 32,18 22,18 20,10" fill={acc} />
          {/* Body (head + thorax + abdomen) */}
          <polygon points="11,2 21,2 23,7 23,14 21,16 11,16 9,14 9,7" fill={acc} />
          {/* Head details */}
          <rect x="13" y="3" width="2" height="4" fill={det} />
          <rect x="11" y="2" width="2" height="2" fill={det} />
          <rect x="17" y="2" width="2" height="2" fill={det} />
          {/* Eyes */}
          <rect x="11" y="5" width="3" height="3" fill={det} />
          <rect x="18" y="5" width="3" height="3" fill={det} />
          {/* Abdomen stripes */}
          <rect x="11" y="16" width="10" height="16" fill={acc} />
          <rect x="11" y="18" width="10" height="3" fill={det} />
          <rect x="11" y="24" width="10" height="3" fill={det} />
          {/* Stinger */}
          <polygon points="14,30 18,30 16,32" fill={det} />
        </>
      );

    case "nautical":
      return (
        <>
          {/* Ship hull */}
          <polygon points="4,18 28,18 26,26 6,26" fill={acc} />
          {/* Deck */}
          <rect x="6" y="15" width="20" height="4" fill={det} />
          {/* Main mast */}
          <rect x="15" y="3" width="2" height="16" fill={acc} />
          {/* Sail */}
          <polygon points="17,4 17,14 28,12 25,5" fill={acc} />
          <polygon points="15,4 15,14 4,12 7,5" fill={det} />
          {/* Crow's nest */}
          <rect x="13" y="2" width="6" height="3" fill={det} />
          {/* Waves below hull */}
          <polygon points="0,26 8,22 12,26 20,22 24,26 32,22 32,32 0,32" fill={det} />
        </>
      );

    case "anteater":
      return (
        <>
          {/* Body */}
          <polygon points="10,14 18,10 26,14 28,22 24,28 10,28 6,22" fill={acc} />
          {/* VERY LONG TUBULAR SNOUT — the defining anteater feature */}
          <polygon points="18,16 32,12 32,16 18,20" fill={acc} />
          <polygon points="19,17 31,13 31,15 19,19" fill={det} />
          {/* Snout tip */}
          <rect x="30" y="13" width="2" height="3" fill={det} />
          {/* Eye on head */}
          <rect x="14" y="14" width="4" height="4" fill={det} />
          <rect x="15" y="15" width="2" height="2" fill={acc} />
          <rect x="16" y="16" width="1" height="1" fill={det} />
          {/* Ear */}
          <polygon points="11,12 14,7 17,12" fill={acc} />
          <polygon points="12,12 14,8 16,12" fill={det} />
          {/* Body bushy tail */}
          <polygon points="6,22 2,20 0,26 4,30 8,28 10,24" fill={acc} />
          <rect x="3" y="22" width="4" height="6" fill={det} />
        </>
      );

    case "abstract":
    default:
      return (
        <>
          {/* Lightning bolt */}
          <polygon points="21,1 8,18 17,18 11,31 24,14 15,14" fill={acc} />
          <polygon points="21,1 8,18 17,18 11,31 24,14 15,14" fill="none" stroke={det} strokeWidth="2" />
        </>
      );
  }
}
