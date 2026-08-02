# RESULT — limb-fur ink fraction: baseline on the existing cap5 frames (no src touched)

Instrument: `$SCRATCH/limbink.mjs` — the interiorink re-derivation #2 code with limb ROIs
added (armL/armR = upperArm+lowerArm dominant, fur groups only, i.e. the bare-forearm band
§7.3 names; legL/legR = upperLeg+lowerLeg, fur). The SEALED cap5 instrument file
(`interiorink.mjs`) is untouched; limbink reproduces its tail/torso numbers exactly
(closeup 2.52/2.16, ratio 1.168 — provenance check passed).

## Numbers (cap5 pixels, measured today)

```
frame              ROI    rows meanW  thr    darkMode margin  gate   runs/row
cap5/sly-closeup   tail   159   48px  L27.5  L38      10.5    ok     2.52
                   torso   25   18px  L23.5  L33       9.5    ok     2.16
                   armL    18   26px  L24.5  L32       7.5    FAIL   (2.50)
                   armR    33   24px  L32.5  L37       4.5    FAIL   (1.82)
                   legL   190   30px  L36.5  L42       5.5    FAIL   (1.71)
                   legR   222   28px  L39.5  L41       1.5    FAIL   (1.30)
cap5/sly-key       legL   190   30px  L40.5  L54      13.5    ok     1.57
                   legR   222   28px  L41.5  L55      13.5    ok     1.30
                   armL/armR                                  FAIL   (2.39/1.82)
                   (torso gate FAILS on sly-key — known from RESULT-cap5)
```

## The finding is the gate column, not the runs column

On the shaded closeup, EVERY limb ROI fails the ink gate: the dark-half Otsu threshold sits
1.5–7.5L below the dark-fur mode, i.e. **limb "ink" is not tonally separable from limb dark
fur**. That is the mechanical signature of §7.3's "fur reads as smooth plastic" on the
limbs: where the tail has an authored near-black ink population 10.5L clear of its dark
band, the limbs have a single dark smear. Under the warm key (sly-key) the legs' fur modes
lift to L54/55 and the gate opens — the legs DO carry countable structure there: 1.30–1.57
runs/row vs tail 2.28.

Baseline to quote for any future limb-fur prereg (ratio-to-tail on sly-key, the only frame
where both gates pass): legL/tail = 0.69, legR/tail = 0.57. Arms are UNMEASURABLE by this
instrument on these frames (18–33 rows, near-unimodal histograms); a limb prereg needs
either merged L+R arm ROIs or a pose that shows more forearm, and that is an instrument
design constraint to register at seal time, not after.

Consistent with §9's honest scoring ("arms and legs are still fairly smooth tubes") — now
with numbers and with the instrument limitation stated before anyone seals bands against it.
