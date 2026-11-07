# Hormone network, ethylene biochemistry and endosperm weakening: sourced parameters

Compiled 2026-11-06 for the deepspace-seed-twin (per-cell ABA / GA / DELLA / ethylene ODEs driving cell expansion and endosperm weakening).
Companion table: `hormones_ethylene.csv` (164 rows: 75 measured, 38 fitted, 29 derived, 22 not_found).

Ground rules followed:
- Every number, equation and citation below was read in a source during this session: Europe PMC full-text XML, PMC article HTML, Europe PMC abstracts, or figure images served by the PMC CDN. Bibliographic details come from api.crossref.org.
- Any value read off a plot (no number printed in the text) is tier `derived` and says "read by eye" in the CSV notes. Where I did arithmetic, the notes show it.
- Where a paper repeats a value from another paper, the CSV notes say "secondary" and name the cited source. I did not read those cited sources.

---

## 0. Access log: what could not be read (important)

| Item | Status | Reason |
|---|---|---|
| Topham et al. 2017 **SI Appendix** (pnas.1704745114.sapp.pdf): ODEs, priors, ABC posteriors | **NOT READ** | The PMC `/articles/instance/5488954/bin/…sapp.pdf` link returns a proof-of-work bot check. pnas.org returns 403 (Cloudflare challenge). Europe PMC: "not open access", so neither the supplementary-files nor the full-text endpoint works. NCBI efetch returns front matter only. These checks were **not bypassed**. No bioRxiv preprint exists (bioRxiv API). The Birmingham repository holds only the main-text PDF. |
| Bassel et al. 2014 **SI** (Lockhart growth law, GA-response function) | **NOT READ** | Same blocks (pnas.org 403; Europe PMC: not OA). |
| Guzmán & Ecker 1990 full text (triple-response conditions) | **NOT READ** | PMC has a scanned PDF only, behind the bot check. academic.oup.com returns 403. Abstract read. |
| Yamaguchi et al. 1998 full text (GA3ox fold induction by R/FR) | **NOT READ** | Scanned PDF only. Abstract read. |
| Dong et al. 1992 full text (apple ACO Km values) | **NOT READ** | Scanned PDF only. Abstract read. |
| Yamagami et al. 2003 JBC full text | **NOT READ** | jbc.org returns 403. Europe PMC abstract read. |
| Müller et al. 2006 Plant Cell Physiol full text | **NOT READ** | Not in PMC. Europe PMC abstract read. |

**To unblock Topham and Bassel:** download the two SI PDFs manually in a normal browser from https://pmc.ncbi.nlm.nih.gov/articles/PMC5488954/ and https://pmc.ncbi.nlm.nih.gov/articles/PMC4060677/ (Supplementary Materials). Then pass them back for verbatim extraction.

Also during the session, PMC briefly served a reCAPTCHA page for ordinary article HTML (rate limiting). I backed off, did not interact with it, and later requests succeeded.

---

## 1. Topham et al. 2017 (PNAS 114:6629): ABA/GA decision-making model

### 1.1 What the main text states (verbatim excerpts)
- Model class: "These relationships were encoded using ordinary differential equations (ODEs) to capture the dynamic metabolic interactions governing these hormone levels (SI Appendix, Supplementary Figs. 1 and 2)."
- Feedback topology source: "Feedbacks between GA and ABA responses onto both hormone synthesis and degradation gene expression were identified using publicly available microarray data generated from whole seeds".
- Fitting: "Effective parameter sets for this model were identified harnessing a range of biological observations, and using approximate Bayesian computation". The ABC method cited is Toni & Stumpf 2010 (their ref. 19).
- Dormancy depth: "This shift to reduced dormancy is achieved by increasing the sensitivity of the system to GA".
- GA catabolism: "GA degrading gene expression (GA 2-oxidase) was not detected at significant levels in germinating or dormant seeds."
- Cold input: "We linked the abundance of these hormone metabolic nodes to the virtual application of temperature inputs to the model. We applied either four continuous units of virtual cold treatment or four cold treatments separated by an equivalent interval of time at control temperature." Cold acts by further inducing CYP707A2 (ABA degradation) and initiating GA3ox1 expression (GA synthesis).
- Multicell model: "four interconnected regions are endowed with the patterns of hormone synthesis, degradation, and response components established by microscopy (Fig. 3D) and signals are exchanged between these regions through a transport rate."
- Transport-rate result: "When cell-to-cell communication is weak (lower transport rate), neither continuous (Fig. 3E) nor variable (Fig. 3F) cold stimuli were capable of flipping the dormancy fate switch. When cells communicated more readily (higher transport rates), continuous cold was incapable of flipping the switch (Fig. 3G), but, notably, a variable input did lead to the breaking of dormancy (Fig. 3H)." The Fig. 3 legend gives the low and high transport rates as 0.45 and 0.75; the panel titles label this quantity Ω.

### 1.2 Network topology: read from the Fig. 1A schematic (no equations)
Nodes: ABA, ABA_S (synthesis), ABA_D (degradation), ABA_R (response); GA, GA_S, GA_D, GA_R. Edges, with their labels as printed:
- ABA_S → ABA; ABA_D ⊣ ABA; GA_S → GA; GA_D ⊣ GA
- ABA → ABA_R through a box labelled "ABA_Sensitivity" (parameter **sA**); GA → GA_R through "GA_Sensitivity" (**sG**)
- **a1**: ABA_R → ABA_S (ABA response promotes ABA synthesis)
- **γ1**: ABA_R → ABA_D (ABA response promotes ABA degradation)
- **δ1**: GA_R → ABA_D (GA response promotes ABA degradation)
- **d1**: GA_R ⊣ ABA_S (GA response represses ABA synthesis)
- **d2**: ABA_R ⊣ GA_S (ABA response represses GA synthesis)
- **b2**: GA_R ⊣ GA_S (GA response represses GA synthesis; negative feedback)

GA_D carries no regulatory input, consistent with GA2ox not being detected. The arrowheads and bars were read from a 677 px figure. Confirm the signs against the SI before coding.

### 1.3 Four-region structure: read from the Fig. 3D table
Regions: **Endosperm | Root cap | Intermediate cell | Vasculature**. In the legend, a dark cross means constitutive, a blue cross means cold-induced, and a blue cross with a dark outline means constitutive and further cold-induced.

| Component | Endosperm | Root cap | Intermediate cell | Vasculature |
|---|---|---|---|---|
| ABA synthesis | constitutive | constitutive | none | constitutive |
| ABA degradation | constitutive + cold-induced | constitutive + cold-induced | none | constitutive + cold-induced |
| ABA response | yes | yes | none | no |
| GA synthesis | cold-induced | cold-induced | none | cold-induced |
| GA response | yes | no | none | yes |

The regions exchange hormones through a single transport rate Ω (0.45 low, 0.75 high). The main text does not give the coupling form (for example diffusive Ω·(X_j − X_i)) or the region adjacency. Both are in the SI. Biological basis in the main text: ABA response (RAB18, ABI3) sits in the outer cells of the radicle (root cap, epidermis). GA response (SCL3, GID1A/C, GAI, RGA) sits in the inner radicle and vasculature. ABA2 and AAO3 are in the outer radicle and vasculature. CYP707A2 is in the root cap, epidermis and vasculature. All components are also present in the endosperm. AIT1 and NPF3 are dual ABA/GA transporters.

### 1.4 NOT FOUND
None of the following could be read: the ODE right-hand sides, functional forms (Hill or mass-action), rate constants, sensitivity values for the deeply versus less dormant models, ABC priors and posteriors, initial conditions, or the magnitude of the cold effect. Each named parameter has a `not_found` row in the CSV. **Do not reconstruct the Topham equations from the schematic and present them as Topham's.** Two published, fully specified alternatives that I read are given in §2.

---

## 2. Fully specified, open-access ABA–GA models (verbatim)

### 2.1 Abley et al. 2021 eLife 10:e59485: ABA–GA–Integrator bistable switch
The equations below are transcribed from the published MathML; symbols are kept as printed. "Integrator" [I] lumps the germination inhibitors DELLAs, ABI4 and ABI5. Its production is promoted by ABA and its degradation by GA. I promotes ABA synthesis and represses GA production.

```
(1)  d[ABA]/dt = β_ABA + f_ABA([I]) − v_ABA [ABA]
(2)  d[GA]/dt  = β_GA + β_GA,Z [Z] + g_GA([I]) − v_GA [GA]
(3)  d[I]/dt   = β_I + f_I([ABA]) − (v_I + f_I([GA])) [I]
     f_X(y) = C_X,Y y^h / (θ_X,Y^h + y^h)          (increasing Hill)
     g_X(y) = C_X,Y / (1 + y^h / θ_X,Y^h)           (decreasing Hill)
(4)  d[Z]/dt   = β_Z − v_Z [Z]                       (sowing-induced GA production signal)
(5)  d[I]/dt   = β_I + f_I([ABA]+[ABA]_exo) − (v_I + f_I([GA]+[GA]_exo)) [I]     (exogenous hormone)
Chemical Langevin versions (Ito, Heun, absorbing barrier at 0, dt = 0.1, run to t = 1000):
(6)  d[ABA]/dt = β_ABA + f_ABA([I]) − v_ABA[ABA] + sqrt( (1/2V)(β_ABA + f_ABA([I]) + v_ABA[ABA]) η_ABA )(t)
(7)  d[GA]/dt  = β_GA + β_GA,Z[Z] + g_GA([I]) − v_GA[GA] + sqrt( (1/2V)(β_GA + β_GA,Z[Z] + g_GA([I]) + v_GA[GA]) ) η_GA(t)
(8)  d[I]/dt   = β_I + f_I([ABA]) − (v_I + f_I([GA]))[I] + sqrt( (1/2V)(β_I + f_I([ABA]) + (v_I + g_I([GA]))[I]) ) η_I(t)
(9)  d[Z]/dt   = β_Z − v_Z[Z] + sqrt( (1/2V)(β_Z + v_Z[Z]) ) η_Z(t)
     <η_X(t) η_Y(t')> = δ(t − t') δ_X,Y ;  noise intensity = 1/V
Steady state:  [I]_0 = (β_I + f_I([ABA]_0)) / (v_I + f_I([GA]_0)),  [ABA]_0 = (β_ABA + f_ABA([I]_0))/v_ABA,
               [GA]_0 = (β_GA + β_GA,Z[Z]_0 + g_GA([I]_0))/v_GA,  [Z]_0 = β_Z/v_Z
```

Two typesetting inconsistencies in the published equations:
- Eq. (8) noise term uses **g_I([GA])**, whereas deterministic eq. (3) uses f_I([GA]). This looks like a typo; use f_I.
- In eq. (6) the MathML puts η_ABA **inside** the square root, whereas eqs (7)–(9) have η outside. Use η outside.

Germination rule: a seed has germinated once [I] falls below a germination threshold. **The threshold value was not found in the text** (`not_found` row). Initial condition: the highest-[I] fixed point with β_GA,Z = 0.

Default parameters (Table 2; all units arbitrary): β_ABA 1, β_GA 0.3, β_GA,Z 0.01, β_Z 39, β_I 0.3, v_ABA 1, v_GA 1, v_Z 0.1, v_I 0.4, θ_ABA,I 3.7, θ_GA,I 1.2, θ_I,ABA 6.5, θ_I,GA 6, C_ABA,I 10, C_GA,I 4, C_I,ABA 10, C_I,GA 6, h 4, V 30.
Scenario values: θ_I,ABA = 10 (monostable), 5.6 and 4.87 (bistable). θ_I,ABA = 7 and 5.8 were used for low- and high-variability lines.
Abley et al. describe their model as "reminiscent of the bistable switch model proposed by Topham et al., 2017, although the mutual inhibition has been implemented differently".

### 2.2 Johnston & Bassel 2018 J R Soc Interface 15:20180042: ABA synthesis/degradation feedback motif
Reaction scheme (eqs 2.1–2.6, transcribed from the equation images): A = ABA, S = synthesis-pathway intermediate, D = degradation-pathway intermediate.
```
∅ --λ(1+Λ_s S)--> A        A --ν(1+Λ_d D)--> ∅
A --β_s--> A + S           A --β_d--> A + D
S --δ_s--> ∅               D --δ_d--> ∅
```
Example parameters: β = 0.1, δ = 1, λ = 10, ν = 0.1, with Λ varied. These are "unitless multiples of a characteristic time scale τ". In the symmetric case the mean is φ_A = λ/ν, and increasing Λ raises the noise while keeping the mean fixed. Code: github.com/StochasticBiology/stochastic-germination. I looked at the repository listing and notes only, not the code.

---

## 3. Bassel et al. 2014 (PNAS 111:8685): embryo growth mechanics
From the main text:
- The FEM model uses "linearly hyperelastic triangular membrane elements" with cell-wall Young's modulus 120 MPa, exterior walls 1 µm thick and interior walls 400 nm, pressurized to 0.5 MPa.
- Growth law: "We then added a Lockhart-type growth model to our FEM simulation, with growth calculated as the integration of the output of GA response and the amount of stretch in the cell wall due to turgor pressure."
- GA input: "The gradient of growth-promoting factors … was defined as a function of the distance from the tip (Fig. 4A)." GA receptor abundance and GA abundance were defined as separate functions (Fig. 4D–L).
- Timing in Col: the first expansion is between 16 and 22 HAI, concurrent with visible testa rupture. Peak relative expansion is near cortical cell 8 (the collet). The 28–32 HAI phase drives endosperm rupture.

**NOT FOUND (SI):** the growth-rate constant, the threshold, and the shape and parameters of the GA-response function.

---

## 4. Ethylene biochemistry and signalling

### 4.1 Biosynthesis kinetics
- **ACC synthase** (8 recombinant Arabidopsis isozymes; Yamagami 2003 abstract): Km(AdoMet) 8.3–45 µM; kcat 0.19–4.82 s⁻¹ per monomer; Ki(AVG) 0.019–0.80 µM; pH optimum 7.3–8.2. The abstract also says the isozymes act as dimers and that IAA induces all ACS genes except ACS7 and ACS9.
- **ACS regulation** (sources read):
  - Wang et al. 2018: low temperatures inhibit ACO more than ACS, "resulting in an accumulation of ACC in the tissues, and then a burst of ethylene production after transfer to 20–25 °C".
  - Wang et al. 2018 reference list includes an ETO1/EOL1/EOL2 paper (title: "…act collectively to regulate ethylene biosynthesis in Arabidopsis by controlling type-2 ACC synthase levels"). I did not read it.
  - Corbineau 2024: "The increase in ethylene production in germinating seeds is essentially explained by an increase in ACC oxidase activity".
- **ACC oxidase** (no Arabidopsis isoform kinetics found):
  - Apple ACCO (recombinant, native; Dilley 2013 Table 1): Km(ACC) 51 µM; Ka(ascorbate) 2.3 mM; Ka(HCO₃⁻) 4.9 mM; activity 3.48 nmol min⁻¹ mg⁻¹ at 20 °C.
  - Km(O₂): "∼28–67 µM" (Dilley 2013, citing tomato work by Thrower et al. 2001 and Mirica & Klinman 2008); "0.2% in apple to 2.2% in banana" as gas phase (Geisler-Lee 2010, citing Burg 1973 and Banks 1985); "below 5 % (v/v)" when ACC accumulates (Jackson 2008, citing Yip et al. 1988). All secondary.
  - CO₂ is required. Half-maximal activity at 0.5% CO₂ (0.15 mM) for purified apple ACO; stoichiometry ACC + ascorbate + O₂ → C₂H₄ + HCN + CO₂ + dehydroascorbate + 2 H₂O (Dong 1992 abstract).
  - Seed relevance (Linkies 2009, Lepidium): in vivo ACO activity is much higher at 21% than 5% O₂ (radicle about 14-fold, read from the plot). ACC promoted endosperm rupture only at 21% O₂, not at 10%. Hypoxic or high-CO₂ habitat atmospheres would therefore act directly on the ethylene branch.

### 4.2 Ethylene production by seeds
- **Germinating-seed emission rate (nL g⁻¹ h⁻¹ or per seed) for Arabidopsis, Lepidium or Brassica: NOT FOUND as a number.**
- Nearest values:
  - Young Col-0 seedlings: ~0.26–0.53 pL seedling⁻¹ h⁻¹, and ~35 pL seedling⁻¹ h⁻¹ with 100 µM ACC (Heslop-Harrison 2024 Fig. 7, read from the bars).
  - *B. napus* (Lechowska 2021, darkness): unprimed seeds kept a "low and relatively stable level of ethylene production … up to 43 h". Primed seeds rose after 21 h. Absolute rates are only in a figure that I could not retrieve.
- **Linkies 2009 Fig. 7 caveat:** the in vivo ACO activity axis is printed in "nkat/organ". 7 nkat per radicle would be about 25 µmol h⁻¹, which is not physically plausible. Use only the within-figure ratios.

### 4.3 Ethylene–ABA antagonism in germination (network edges for the twin)
From Linkies et al. 2009 (Lepidium and Arabidopsis Col):
- Ethylene/ACC promotes endosperm rupture and counteracts ABA inhibition of it. Testa rupture is unaffected by ACC, NBD or ABA.
- ACO2 is required. With 1 mM ACC on 1 µM ABA, GR50 rises 4.6-fold in Col WT versus 1.1 in *aco2* and 1.3 in *ctr1*.
- ABA inhibits ACO1 transcript accumulation (radicle and cap) and ACO2 in the cap, but not ACO2 in the radicle. Late ACO activity in ABA-treated radicles is attributed to ACO2.
- "A basal level of ethylene signaling is required to maintain ACO2 transcript levels" (positive feedback).
- ACC and NBD changed whole-seed ABA only transiently (Fig. 8A, read from the plot).

From Wang et al. 2018 (dormant Col-0, 25 °C, dark):
- Germination improves from 0.125 ppm. About 50% germinate at 1.25 ppm and about 100% at 50–100 ppm. Control is 0.9 ± 0.1%; 50 ppm gives 96.3 ± 2.2%.
- 1 d at 4 °C plus 1.25 ppm gives about 75%.
- 10 µM ABA suppresses the ethylene effect.
- 100 ppm ethylene for 48 h lowers RGA, GAI and RGL2 transcripts to 0.43, 0.26 and 0.05 of control, and almost abolishes ABI5 expression by 24 h. These are edges from ethylene to DELLA and ABI5.

From Ogawa 2003: exogenous GA4 upregulated an ACO gene and the ethylene-responsive HLS1 and ERS1 in ga1-3 seeds (GA → ethylene).

### 4.4 Ethylene response kinetics (triple response)
- **Guzmán & Ecker 1990 assay conditions: NOT FOUND** (full text inaccessible). The abstract gives only that *eto1* produces "at least 40 times more ethylene than the wild type". Crossref lists both doi:10.1105/tpc.2.6.513 (publisher) and doi:10.2307/3869113 (JSTOR) for the same article.
- Binder et al. 2004 (Col, etiolated hypocotyls, 10 µL L⁻¹, measured 10.6 ± 0.6):
  - 15 min lag
  - a phase down to 0.13 mm h⁻¹
  - a new steady state of 0.03 mm h⁻¹ at about 75 min
  - recovery about 90 min after removal (30 min lag)
  - ERS1, ERS2 and ETR2 mRNA up 3.8-, 6.6- and 14.3-fold after 2 h
- Binder et al. 2018: 8.7 nL L⁻¹ gives only a transient decrease, with recovery in about 2 h while still exposed.
- Azhar et al. 2023 (secondary statements): ETR1 Kd 2.4 × 10⁻⁹ M; dissociation half-life over 12 h; plants respond to as little as 0.2 nL L⁻¹.
- **Dose–response EC50 for hypocotyl or root: NOT FOUND.**

---

## 5. Endosperm weakening and rupture mechanics

Lepidium (all puncture-force data are for cress; Arabidopsis is too small for this method):
- **Linkies 2009, FR1, 18 °C:**
  - The cap puncture force falls from ~38 mN at 8 h to ~19.5 mN by 18 h (read from the plot).
  - Minimum ~19 mN.
  - ER5% at about 32 mN and ER50% at about 23 mN (printed on the figure). CON and 10 µM ABA follow the same relationship between force and rupture percentage.
  - 10 µM ABA keeps the force at ~37–39 mN until 30 h and reaches ~18.5 mN only at 120 h (read from the plot).
  - Accession FR14 values are about twofold FR1.
  - Isolated caps form holes autonomously: 10 µM GA4+7 gives 60.0 ± 9.4% versus 26.9 ± 8.8% for CON on day 3. ACC promotes hole formation; ABA and NBD inhibit it.
  - ACC reverses ABA inhibition of weakening only in the late phase, not at 18 h (qualitative).
- **Steinbrecher 2025 (different accession or rig):**
  - Unweakened caps are about 115 mN at 5 h, falling to 80–85 mN at 15 h at 18 °C and 27 °C.
  - At 11 °C the force falls only to about 95 mN; at 32 °C there is no reduction.
  - Cap stiffness is the slope of the force–displacement curve; at 11 °C the stiffness-versus-force regression shifts down by about 150 mN/mm.
  - WT reaches 50% endosperm rupture at about 350 °C·h (15 h) at 24 °C. DOG1-overexpressing seeds need about 15,000 °C·h.
- **Müller 2006 (abstract):**
  - Testa rupture and endosperm rupture are sequential.
  - ABA "delays the onset and decreases the rate of this weakening process in a dose-dependent manner".
  - "An early embryo signal is required and sufficient to induce endosperm weakening". "Gibberellins can replace this embryo signal", and "weakening is regulated by the gibberellin/ABA ratio".
- **Pearce 2011:** a Mooney–Rivlin membrane-indentation framework, with W = μ/(2(1+α))[(1−α)(λ_s²+λ_θ²+λ_s⁻²λ_θ⁻²−3) + α(λ_s⁻²+λ_θ⁻²+λ_s²λ_θ²−3)] (their eq. 2.5). It reports that, in preliminary experiments, endosperm vertical length "may double in size before rupture". No fitted modulus.

**Arabidopsis micropylar endosperm mechanical values: NOT FOUND.**

**Rupture timing in Col-0:**
- Dekkers 2013 (22 °C, continuous light): testa rupture starts about 20 HAS and is nearly complete by 31 HAS; endosperm rupture runs from 31 HAS to completion by 45 HAS.
- Linkies 2009 (24 °C, continuous light, no stratification): at 38 h, about 89% testa rupture and about 63% endosperm rupture (read from the bars).
- Bassel 2014: first expansion and testa rupture at 16–22 HAI; endosperm rupture driven at 28–32 HAI.

---

## 6. ABA and GA contents during imbibition

- **ABA, Col WT** (Okamoto 2006 Fig. 4C, read from the plot, ng g⁻¹ DW): ~68 at 0 h, ~19 at 6 h, ~15 at 12 h, ~13 at 24 h. Text: about 70% decrease at 12 h.
- Kushiro 2004: ABA "reached half the normal level within about 6 h" and the basal level after 12 h. CYP707A2 mRNA peaks at 6 h. Dry *cyp707a2* seeds have 6× WT ABA.
- **ABA, Ler** (Ogawa 2003 Fig. 5A, read from the plot): ~145 at 0 h, ~58 at 8 h, ~39 at 16 h, then a plateau of ~18 ng g⁻¹ DW from 24 h.
- **ABA decline kinetics (derived, first-order on total ABA):**

  | Dataset | k (h⁻¹) | t½ (h) | Notes |
  |---|---|---|---|
  | Col, 70% drop in 12 h | 0.100 | 6.9 | |
  | Col, 0–6 h from figure | 0.21 | 3.3 | 1.9 h if the ~13 ng/g plateau is treated as non-degradable |
  | Ler, 0–8 h | 0.115 | 6.1 | |
  | Lepidium, 0–8 h | 0.24 | 2.8 | |

  A **plateau** (basal level after ~12–24 h) means a pure decay model is wrong. Use synthesis plus degradation with a steady state.
- **GA4, Ler, 22 °C continuous light** (Ogawa 2003 Fig. 2, read from the plot, ng g⁻¹ DW): ~2.4 at 0 h (text: "one-third of the maximum level"), ~2.9 at 24 h, ~5.0 at 32 h, ~5.7 at 40 h. The "dramatic increase" between 24 and 32 h coincides with radicle protrusion.
- GA3ox1 transcript peaks at 8 h; GA3ox2 tracks GA4 and peaks around 32 h. GA2ox transcripts stay low before emergence, so GA4 rises through synthesis rather than reduced deactivation. GA1 is about 10% of GA4 (Yamauchi 2004).
- **Col-0 GA time course: NOT FOUND** (both GA studies used Ler).

---

## 7. Light / phytochrome gating

- Yamaguchi 1998 (abstract): GA3ox1 (GA4) and GA3ox2 (GA4H) are "induced within 1 hr after a brief red (R) light treatment". The GA3ox2 response needs phyB; GA3ox1 does not.
- **Fold induction in WT: NOT FOUND.** In ga1 seeds, Oh 2007 Fig. 3A shows GA3ox1 about 3-fold R/FR, GA3ox2 from near zero to ~0.33 units, and GA2ox2 repressed about 5-fold (read from the bars). Red light lowers GAI and RGA transcripts 3–4-fold (text). This is a light → DELLA-transcription edge mediated by PIL5.
- Col-0 germination in darkness depends on the light history before darkness:

  | Treatment | Germination | Source |
  |---|---|---|
  | Darkness with no far-red pulse (1 h imbibition, 6 d dark, 22 °C) | ~98% | Oh 2004 Fig. 3C, read from bar |
  | After a 5-min far-red pulse (0.96 mmol m⁻²) | ~0% | Oh 2004 Fig. 3C, read from bar |
  | Red pulse (6 mmol m⁻²) | ~99% | Oh 2004 Fig. 3C, read from bar |
  | Continuous white light | ~98% | Oh 2004 Fig. 3C, read from bar |
  | 0 µmol m⁻² red after a far-red pulse | did not germinate | Oh 2007 text |
  | 65 µmol m⁻² red after a far-red pulse | ~100% | Oh 2007 text |
  | Ler, far-red pulse then dark at 22 °C | 0% | Yamauchi 2004 |
  | Ler, far-red pulse, 48 h at 4 °C, then dark | 74% | Yamauchi 2004 |

  Yamauchi 2004 also reports about a 2-fold rise in bioactive GA at 4 °C, which needs GA3ox1.
- Light protocols:
  - Oh 2007: FR 3.2 µmol m⁻² s⁻¹ or R 13 µmol m⁻² s⁻¹, 5 min.
  - Yamauchi 2004: FR 91 µmol m⁻² s⁻¹ or R 120 µmol m⁻² s⁻¹, 5 min.

---

## 8. Gaps (CSV `not_found` rows)
1. Topham 2017: ODEs, all rate constants, sensitivities, ABC priors and posteriors, coupling form (SI blocked).
2. Bassel 2014: Lockhart extensibility and threshold, GA-response function (SI blocked).
3. Guzmán & Ecker 1990 assay conditions; hypocotyl/root ethylene EC50.
4. Ethylene emission rate of germinating Arabidopsis or cress seeds (nL g⁻¹ h⁻¹, per seed) and its time course.
5. Kinetic constants of Arabidopsis ACO isoforms (only apple and tomato values found).
6. Mechanical properties of the Arabidopsis micropylar endosperm; endosperm elastic modulus for any species.
7. WT fold induction of GA3ox1/GA3ox2 by red light; Col-0 GA time course.
8. Germination threshold value for the Integrator in Abley 2021.

## 9. Caveats
- **Species and ecotype mixing:** Ogawa and Yamauchi used Ler, Okamoto, Kushiro, Dekkers and Oh used Col, and all puncture-force data are for Lepidium. ACO kinetics are from apple and tomato, and ACS kinetics from recombinant Arabidopsis enzymes.
- **Model parameters are in arbitrary units** (Abley, Johnston, Topham Ω). They are useful for network shape, not for absolute concentrations. To map them to ng g⁻¹ DW, calibrate against §6.
- **Values read off plots** (tier `derived`, "read by eye") carry roughly ±5–10% reading error. Prefer the text-stated numbers where both exist.
- **Dormancy state matters:** Wang 2018 used freshly harvested, dormant seeds at 25 °C; most other datasets used after-ripened seeds.
- **Secondary citations** (Km(O₂), ETR1 Kd, Corbineau's ABA drop) were read only as quoted in the citing paper.
- **Absolute puncture forces differ about threefold between labs and accessions** (38 vs 115 mN unweakened). Model weakening as a fraction of the initial force.
- **Hardware atmosphere:** O₂ and CO₂ dependence of ACO (Km(O₂) 0.2–2.2% gas phase, CO₂ half-max 0.5%) means closed-chamber gas composition will change ethylene output in a spaceflight twin.

## 10. Verified references (Crossref metadata, retrieved 2026-11-06)
The year shown is Crossref's `issued` year. Titles are Crossref title strings with HTML italics tags removed; any missing spaces are as deposited.

- Abley K, Formosa-Jordan P, Tavares H, Chan EY, Afsharinafar M, Leyser O, Locke JC (2021). An ABA-GA bistable switch can account for natural variation in the variability of Arabidopsis seed germination time. *eLife* 10:e59485. doi:10.7554/elife.59485
- Azhar BJ, Abbas S, Aman S, Yamburenko MV, Chen W, Müller L, Uzun B, Jewell DA, Dong J, Shakeel SN, Groth G, Binder BM, Grigoryan G, Schaller GE (2023). Basis for high-affinity ethylene binding by the ethylene receptor ETR1 of Arabidopsis. *Proceedings of the National Academy of Sciences* 120(23):e2215195120. doi:10.1073/pnas.2215195120
- Bassel GW, Stamm P, Mosca G, Barbier de Reuille P, Gibbs DJ, Winter R, Janka A, Holdsworth MJ, Smith RS (2014). Mechanical constraints imposed by 3D cellular geometry and arrangement modulate growth patterns in the Arabidopsis embryo. *Proceedings of the National Academy of Sciences* 111(23):8685-8690. doi:10.1073/pnas.1404616111
- Binder BM, O'Malley RC, Wang W, Moore JM, Parks BM, Spalding EP, Bleecker AB (2004). Arabidopsis Seedling Growth Response and Recovery to Ethylene. A Kinetic Analysis. *Plant Physiology* 136(2):2913-2920. doi:10.1104/pp.104.050369
- Binder BM, Kim HJ, Mathews DE, Hutchison CE, Kieber JJ, Schaller GE (2018). A role for two‐component signaling elements in the Arabidopsis growth recovery response to ethylene. *Plant Direct* 2(5):e00058. doi:10.1002/pld3.58
- Corbineau F (2024). Ethylene, a Signaling Compound Involved in Seed Germination and Dormancy. *Plants* 13(19):2674. doi:10.3390/plants13192674
- Dekkers BJ, Pearce S, van Bolderen-Veldkamp R, Marshall A, Widera P, Gilbert J, Drost HG, Bassel GW, Müller K, King JR, Wood AT, Grosse I, Quint M, Krasnogor N, Leubner-Metzger G, Holdsworth MJ, Bentsink L (2013). Transcriptional Dynamics of Two Seed Compartments with Opposing Roles in Arabidopsis Seed Germination. *Plant Physiology* 163(1):205-215. doi:10.1104/pp.113.223511
- Dilley DR, Wang Z, Kadirjan-Kalbach DK, Ververidis F, Beaudry R, Padmanabhan K (2013). 1-Aminocyclopropane-1-carboxylic acid oxidase reaction mechanism and putative post-translational activities of the ACCO protein. *AoB PLANTS* 5 (no page or article number in Crossref; article id plt031). doi:10.1093/aobpla/plt031
- Dong JG, Fernández-Maculet JC, Yang SF (1992). Purification and characterization of 1-aminocyclopropane-1-carboxylate oxidase from apple fruit. *Proceedings of the National Academy of Sciences* 89(20):9789-9793. doi:10.1073/pnas.89.20.9789
- Geisler-Lee J, Caldwell C, Gallie DR (2009). Expression of the ethylene biosynthetic machinery in maize roots is regulated in response to hypoxia. *Journal of Experimental Botany* 61(3):857-871. doi:10.1093/jxb/erp362
- Guzmán P, Ecker JR (1990). Exploiting the triple response of Arabidopsis to identify ethylene-related mutants. *The Plant Cell* 2(6):513-523. doi:10.1105/tpc.2.6.513. Crossref also holds a JSTOR DOI: Guzman P, Ecker JR (1990). Exploiting the Triple Response of Arabidopsis to Identify Ethylene-Related Mutants. *The Plant Cell* 2(6):513. doi:10.2307/3869113
- Heslop-Harrison G, Nakabayashi K, Espinosa-Ruiz A, Robertson F, Baines R, Thompson CR, Hermann K, Alabadí D, Leubner-Metzger G, Williams RS (2024). Functional mechanism study of the allelochemical myrigalone A identifies a group of ultrapotent inhibitors of ethylene biosynthesis in plants. *Plant Communications* 5(6):100846. doi:10.1016/j.xplc.2024.100846
- Jackson MB (2007). Ethylene-promoted Elongation: an Adaptation to Submergence Stress. *Annals of Botany* 101(2):229-248. doi:10.1093/aob/mcm237
- Johnston IG, Bassel GW (2018). Identification of a bet-hedging network motif generating noise in hormone concentrations and germination propensity in Arabidopsis. *Journal of The Royal Society Interface* 15(141):20180042. doi:10.1098/rsif.2018.0042
- Kushiro T, Okamoto M, Nakabayashi K, Yamagishi K, Kitamura S, Asami T, Hirai N, Koshiba T, Kamiya Y, Nambara E (2004). The Arabidopsis cytochrome P450 CYP707A encodes ABA 8′‐hydroxylases: key enzymes in ABA catabolism. *The EMBO Journal* 23(7):1647-1656. doi:10.1038/sj.emboj.7600121
- Lechowska K, Wojtyla Ł, Quinet M, Kubala S, Lutts S, Garnczarska M (2021). Endogenous Polyamines and Ethylene Biosynthesis in Relation to Germination of Osmoprimed Brassica napus Seeds under Salt Stress. *International Journal of Molecular Sciences* 23(1):349. doi:10.3390/ijms23010349
- Linkies A, Müller K, Morris K, Turečková V, Wenk M, Cadman CS, Corbineau F, Strnad M, Lynn JR, Finch-Savage WE, Leubner-Metzger G (2009). Ethylene Interacts with Abscisic Acid to Regulate Endosperm Rupture during Germination: A Comparative Approach Using Lepidium sativum and Arabidopsis thaliana. *The Plant Cell* 21(12):3803-3822. doi:10.1105/tpc.109.070201
- Müller K, Tintelnot S, Leubner-Metzger G (2006). Endosperm-limited Brassicaceae Seed Germination: Abscisic Acid Inhibits Embryo-induced Endosperm Weakening of Lepidium sativum (cress) and Endosperm Rupture of Cress and Arabidopsis thaliana. *Plant and Cell Physiology* 47(7):864-877. doi:10.1093/pcp/pcj059
- Ogawa M, Hanada A, Yamauchi Y, Kuwahara A, Kamiya Y, Yamaguchi S (2003). Gibberellin Biosynthesis and Response during Arabidopsis Seed Germination[W]. *The Plant Cell* 15(7):1591-1604. doi:10.1105/tpc.011650
- Oh E, Kim J, Park E, Kim JI, Kang C, Choi G (2004). PIL5, a Phytochrome-Interacting Basic Helix-Loop-Helix Protein, Is a Key Negative Regulator of Seed Germination inArabidopsis thaliana [W]. *The Plant Cell* 16(11):3045-3058. doi:10.1105/tpc.104.025163
- Oh E, Yamaguchi S, Hu J, Yusuke J, Jung B, Paik I, Lee HS, Sun Tp, Kamiya Y, Choi G (2007). PIL5, a Phytochrome-Interacting bHLH Protein, Regulates Gibberellin Responsiveness by Binding Directly to theGAIandRGAPromoters inArabidopsisSeeds. *The Plant Cell* 19(4):1192-1208. doi:10.1105/tpc.107.050153
- Okamoto M, Kuwahara A, Seo M, Kushiro T, Asami T, Hirai N, Kamiya Y, Koshiba T, Nambara E (2006). CYP707A1 and CYP707A2, Which Encode Abscisic Acid 8′-Hydroxylases, Are Indispensable for Proper Control of Seed Dormancy and Germination in Arabidopsis. *Plant Physiology* 141(1):97-107. doi:10.1104/pp.106.079475
- Pearce S, King J, Holdsworth M (2011). Axisymmetric indentation of curved elastic membranes by a convex rigid indenter. *International Journal of Non-Linear Mechanics* 46(9):1128-1138. doi:10.1016/j.ijnonlinmec.2011.04.030
- Steinbrecher T, Voegele A, Ignatz M, Weitbrecht K, Khan S, Graeber K, Hourston JE, Leubner‐Metzger G (2025). Distinct Molecular Biomechanical Mechanisms Inhibit Endosperm Cell‐Wall Weakening and Seed Germination at Cold and Warm Nonoptimal Temperatures. *Plant, Cell & Environment* 48(11):8047-8067. doi:10.1111/pce.70103
- Topham AT, Taylor RE, Yan D, Nambara E, Johnston IG, Bassel GW (2017). Temperature variability is integrated by a spatially embedded decision-making center to break dormancy in Arabidopsis seeds. *Proceedings of the National Academy of Sciences* 114(25):6629-6634. doi:10.1073/pnas.1704745114
- Wang X, Yesbergenova-Cuny Z, Biniek C, Bailly C, El-Maarouf-Bouteau H, Corbineau F (2018). Revisiting the Role of Ethylene and N-End Rule Pathway on Chilling-Induced Dormancy Release in Arabidopsis Seeds. *International Journal of Molecular Sciences* 19(11):3577. doi:10.3390/ijms19113577
- Yamagami T, Tsuchisaka A, Yamada K, Haddon WF, Harden LA, Theologis A (2003). Biochemical Diversity among the 1-Amino-cyclopropane-1-Carboxylate Synthase Isozymes Encoded by the Arabidopsis Gene Family. *Journal of Biological Chemistry* 278(49):49102-49112. doi:10.1074/jbc.m308297200
- Yamaguchi S, Smith MW, Brown RGS, Kamiya Y, Sun Tp (1998). Phytochrome Regulation and Differential Expression of Gibberellin 3β-Hydroxylase Genes in Germinating Arabidopsis Seeds. *The Plant Cell* 10(12):2115-2126. doi:10.1105/tpc.10.12.2115
- Yamauchi Y, Ogawa M, Kuwahara A, Hanada A, Kamiya Y, Yamaguchi S (2004). Activation of Gibberellin Biosynthesis and Response Pathways by Low Temperature during Imbibition of Arabidopsis thaliana Seeds[W]. *The Plant Cell* 16(2):367-378. doi:10.1105/tpc.018143

Cited only secondarily or as method references (Crossref-verified, not read in full):
- Thrower JS, Blalock R, Klinman JP (2001). Steady-State Kinetics of Substrate Binding and Iron Release in Tomato ACC Oxidase. *Biochemistry* 40(32):9717-9724. doi:10.1021/bi010329c
- Toni T, Stumpf MPH (2009). Simulation-based model selection for dynamical systems in systems and population biology. *Bioinformatics* 26(1):104-110. doi:10.1093/bioinformatics/btp619
- Voegele A, Graeber K, Oracz K, Tarkowská D, Jacquemoud D, Turečková V, Urbanová T, Strnad M, Leubner-Metzger G (2012). Embryo growth, testa permeability, and endosperm weakening are major targets for the environmentally regulated inhibition of Lepidium sativum seed germination by myrigalone A. *Journal of Experimental Botany* 63(14):5337-5350. doi:10.1093/jxb/ers197 (full text read; puncture-force values only in figures, not used)
- Wang X, Gomes MM, Bailly C, Nambara E, Corbineau F (2021). Role of ethylene and proteolytic N‐degron pathway in the regulation of Arabidopsis seed dormancy. *Journal of Integrative Plant Biology* 63(12):2110-2122. doi:10.1111/jipb.13173 (source of Corbineau 2024's ABA 43.9 → 6.2 ng g⁻¹ DW statement; not read)

Not Crossref-verified: works named only as they appear inside the sources (Burg 1973; Banks 1985; Yip et al. 1988; Mirica & Klinman 2008; Chen & Bleecker 1995; Schaller & Bleecker 1995).
