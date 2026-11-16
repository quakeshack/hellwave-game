# Held weapons and the player model

Hellwave players are the skeletal model `progs/player.iqm`, and the weapon a player uses is drawn in the hand: other players,
and the player in the third-person camera, see it. The first-person view model is the same as in id1.

## How it works

- `HellwavePlayer._modelPlayer` is `progs/player.iqm`; id1 sets and precaches whatever that names. The frame order is the one of
  `progs/player.mdl`, so id1's frame states drive it unchanged.
- Each player owns up to two `HeldWeaponEntity` (`hellwave_heldweapon`) entities, attached to tags of the player model
  (`ServerEdict.setAttachment`, see the engine's `docs/skeletal-models.md`): the **last gun** on `tag_weapon`, which the
  animation carries on the back while the axe is out, and the **axe**, on `tag_axe` while it is the weapon in use and in its
  **holster on the back**, `tag_axe_back`, while a gun is. Both are always drawn; the axe is moved between the two tags when the weapon changes.
  `tag_axe_back` is a tag the rig does not have: the exporter adds it to `spine1` (`--tag-on`, see `progs/src/build-models.sh`), so it follows the torso.
- `HellwavePlayer._syncHeldWeapons()` keeps them in line with the weapon in use. It is idempotent and cheap, and runs when the weapon
  changes, in `playerPostThink`, and when the player dies, spectates or comes back. A dead, spectating or invisible player (the eyes
  model has no tags) carries nothing: the entities are freed.
- The model of each weapon is `playerModel` in id1's `weaponConfig`; `entity/HeldWeapons.ts` fills it for all weapons when the module is
  loaded and precaches the models with the player.
- Looking up and down **bends the spine** of the player instead of tilting the whole body: id1's player client handler turns `spine0`, `spine1`, `neck` and `head`
  with the look pitch (engine: `SetEntityJointAngles`), so the weapon in the hand and the one on the back move with the back.
- The **muzzle flash sprite**: when the engine counts a shot of a player (`ClientEdict.muzzleFlashCount`, see the engine's `docs/client-entities.md`), `HellwavePlayerClientEdictHandler` puts a client-only entity `hellwave_muzzleflash` on the `tag_flash` of the weapon in the hand: one of three random GIFs of the weapon's family from `gfx/muzzle_flash/` (`muzzleFlashFamilies` in `client/entity/MuzzleFlash.ts`: `star_shotgun` for both shotguns and the rocket launcher, `star_smg` for the nailgun, `star_rifle` for the super nailgun and the grenade launcher, `energy_plasma` for the thunderbolt; the axe has none), rolled randomly, removed when its animation is over. Their settings files (`<file>.gif.json`) choose additive blending, the size and `parallelOriented`, which is what lets the roll turn the picture. It is not made in first person (the player's own model is not drawn there, and neither is what hangs on it).
- The **muzzle flash** of a player is the light of `EF_MUZZLEFLASH`. id1's client handler asks `ClientEngineAPI.GetMuzzleFlashOrigin`,
  which finds the `tag_flash` of the held gun, so the light sits at the barrel; pulled out of a wall if the barrel is in one.

## Adding or changing a weapon model

The models are built from the LibreQuake sources by `data/hellwave/progs/src/build-models.sh` (Blender 5.x and the exporters of the
`qs-tools` repository, `blender/README.md`). A weapon is one line there: its name, the world model it is made from, `--tag-muzzle
tag_flash` for a gun.

The **grip** (`progs/src/grips/<name>.json`) places the model in the space of the player's tag: `translation`, `rotation` (degrees,
XYZ) and `scale`. The files in the repository are first guesses from `fit_grip.py`, which fits the world model onto the gun that is
built into the LibreQuake player. Adjust them by looking at the weapon on a player in chase view (`chase_active 1`, weapons from
`impulse 9` after `sv_cheats 1`) and rebuild with the script. `entitytag <entity> tag_weapon` prints where the tag is.

Weapons whose model is not in the table (a weapon added by a game built on this one) show nothing in the hand, which is not an error.
