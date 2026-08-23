// NOT MIT. Unlike the rest of this repository, the two outlines below are
// Apple's: traced from /System/Library/Fonts/SFNS.ttf, which Apple licenses
// for use on Apple platforms. The repository's licence does not cover them.
//
// They are here to draw a screenshot and nothing else. `scripts/` is never
// published — the root manifest is private, and npm resolves a package's
// `files` inside its own directory, so no plugin can reach them. Do not copy
// them into one; redraw the shapes by hand if a product ever needs them.
//
// They are outlines rather than the characters ⇧ and ⌘ because no font that
// travels with this repository draws them. bb sets its interface in Inter,
// which the harness renders against, and Inter has neither codepoint — so
// asking for the characters gets whatever the capturing machine substitutes,
// which is Apple's own font on a Mac and a CJK face standing in for a shift
// key in the capture container.

/** The em the coordinates below are measured on. */
export const KEY_GLYPH_EM = 2048;

/**
 * Traced at the weight and optical size the chip is set in, 600 and 17px, so
 * the keys read as the keys a reader is being told to press. `box` is the
 * glyph's own ink, which is what the chip sizes and centres, so a symbol
 * stands as tall beside a letter as the font would have set it.
 */
export const KEY_GLYPHS = {
  "⇧": {
    box: [160, -27, 1898, 1482],
    path: "M782 -27Q688 -27 638 26Q587 78 587 168V493H296Q238 493 199 526Q160 558 160 612Q160 647 174 672Q189 697 220 728L919 1431Q943 1455 971 1468Q999 1482 1029 1482Q1060 1482 1088 1468Q1116 1455 1139 1431L1839 728Q1868 697 1883 672Q1898 646 1898 612Q1898 558 1859 526Q1821 493 1762 493H1471V168Q1471 78 1420 26Q1370 -27 1276 -27ZM831 167H1227Q1245 167 1256 179Q1268 191 1268 208V640Q1268 666 1295 666H1615Q1620 666 1620 670Q1620 673 1617 676L1038 1253Q1034 1257 1029 1257Q1024 1257 1020 1253L441 676Q439 673 439 670Q439 666 444 666H763Q790 666 790 640V208Q790 190 801 179Q813 167 831 167Z",
  },
  "⌘": {
    box: [200, -29, 1707, 1474],
    path: "M505 -29Q421 -29 351 13Q282 54 241 123Q200 193 200 277Q200 361 241 429Q282 498 351 538Q421 578 505 578H1402Q1486 578 1555 538Q1625 498 1666 429Q1707 361 1707 277Q1707 193 1666 123Q1625 54 1555 13Q1486 -29 1402 -29Q1318 -29 1249 13Q1180 54 1139 124Q1097 193 1097 277V1169Q1097 1252 1139 1322Q1180 1391 1249 1432Q1318 1474 1402 1474Q1486 1474 1555 1432Q1625 1391 1666 1322Q1707 1253 1707 1169Q1707 1084 1666 1016Q1625 947 1555 907Q1486 866 1402 866H721Q685 866 660 892Q634 917 634 953Q634 989 660 1014Q685 1040 721 1040H1398Q1453 1040 1491 1077Q1529 1115 1529 1168Q1529 1221 1492 1259Q1454 1296 1402 1296Q1350 1296 1312 1258Q1274 1219 1274 1165V281Q1274 225 1312 187Q1350 149 1402 149Q1454 149 1492 187Q1529 224 1529 277Q1529 330 1491 368Q1453 406 1398 406H509Q454 406 416 368Q377 330 377 277Q377 224 415 187Q453 149 505 149Q557 149 595 187Q633 226 633 281V1165Q633 1219 595 1258Q557 1296 505 1296Q453 1296 415 1259Q377 1221 377 1168Q377 1115 416 1077Q454 1040 509 1040H721Q757 1040 782 1014Q808 989 808 953Q808 917 782 892Q757 866 721 866H505Q421 866 351 907Q282 947 241 1016Q200 1084 200 1169Q200 1253 241 1322Q282 1391 351 1432Q421 1474 505 1474Q589 1474 658 1432Q727 1391 768 1322Q809 1252 809 1169V277Q809 193 769 124Q728 54 659 13Q590 -29 505 -29Z",
  },
};
