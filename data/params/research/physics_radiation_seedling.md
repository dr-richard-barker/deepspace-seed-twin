# Physics, spaceflight ethylene, radiation→hormone and seedling-kinetics parameters

**For the deepspace-seed-twin (Arabidopsis seed → 5-day seedling under spaceflight hardware environments).**
Companion table: `physics_radiation_seedling.csv` (121 rows; 64 measured, 30 standard, 11 derived, 16 not_found).
Compiled 2026-11-06.

## How this was sourced

- Every number in the CSV comes from a text I opened and read. Sources were PMC full text (HTML), Copernicus ACP PDFs (Sander 2015; Tang 2014/2015), NASA NTRS PDFs (Massa 2016 and APH slides; Rakow 1995, a scanned report I OCR'd), or Europe PMC abstracts where full text was paywalled. The `locator` column says which one applies.
- Each CSV `quote` was checked by script against the saved source text: whitespace-normalised substring match. Every quote matched.
- Every DOI below was resolved on api.crossref.org. The reference list was generated from those Crossref records, so the titles, author lists and capitalisation are Crossref's own.
- Tiers: **measured** means the value was measured in the cited study. When it is quoted second-hand, the notes say "SECONDARY". **standard** means a compiled constant, textbook correlation, hardware specification or agency reference-model output; the notes say which. **derived** means my own arithmetic, with the formula in the notes. **not_found** means I searched and found no readable source.
- Some sources could not be read:
  - Two scanned PMC PDFs, Gendreau 1997 (PMC158305) and Guzmán & Ecker 1990 (PMC159907), sit behind a browser proof-of-work download page. I did not try to get around it, so their numbers are marked not_found. Opening those PDFs in a normal browser and copying the values out by hand would close both gaps.
  - The Levine 2000 BRIC papers and Nagata 2004 are paywalled. For these only the abstracts were used.

## 1. Gas-transport physics

### 1.1 Forced convection to a sphere: Ranz–Marshall

As stated by Stiti et al. 2022 (Environ Res 204:112072; Sect. 2.2, Eq. [8]):

> "Frequently used expressions for Nu and Sh are provided by the Ranz-Marshall correlation (Ranz and Marshall, 1952)"

- **Nu = 2 + 0.6 Re^1/2 Pr^1/3 ; Sh = 2 + 0.6 Re^1/2 Sc^1/3**
- Re = 2|v_g − v_∞| r_d / ν_g (based on diameter), Sc = ν_g / D_v.
- The 1952 original is listed by the source as *Chem. Eng. Prog.* 48:141–146. It has no DOI and I did not read it.

**Conflict.** Dbouk & Drikakis 2020 (Phys Fluids 32:093312, Eq. 6) attribute **Nu = 2 + 0.55 Re^1/2 Pr^1/3** to the same Ranz & Marshall papers. Until the original is checked, record 0.6 as the default and 0.55 as an alternative. At Re ≤ 1 the difference is under 3% in Sh.

**Microgravity and quiescent limit.** With Re → 0 and no buoyant flow, Sh → 2 (pure diffusion to an isolated sphere). Then k_m = 2D/d. This is a lower bound: a finite sealed chamber is not an infinite medium.

### 1.2 Natural convection from a sphere: Churchill (1983)

Stated form, from M.M. Yovanovich's University of Waterloo heat-transfer course worksheet NCSPH3. This is a web teaching page with no DOI. The worksheet labels it "Sphere correlation equation of Churchill for laminar flow":

**Nu_D = 2 + 0.589 Ra_D^1/4 / [1 + (0.469/Pr)^(9/16)]^(4/9)**, with Ra_D = gβ(T_w − T_∞)D³/(αν).

- The primary paper is Churchill SW 1983, *Chem Eng Commun* 24:339–352, doi:10.1080/00986448308940090. Crossref confirms it; I did not read the full text.
- The mass-transfer analogue (Sh, Sc, and Gr·Sc in place of Ra) is a heat–mass analogy *assumption*. The source does not state it.
- Do **not** copy the equation from Sánchez-García et al. 2024 (PMC11490890). Their MathML has the exponent as 9/6 and drops the outer 4/9 power.
- Zhen et al. 2024 (Sci Rep 14:16565) confirm the general "2 + n·Gr^l" structure. They state Nu ∝ Gr^0.25 for an isothermal sphere.
- Yuge 1960 (J Heat Transfer 82:214–220, doi:10.1115/1.3679912) is verified in Crossref, but I could not read its stated form, so it is marked not_found.
- In 0 g, Gr = 0 and the buoyant term vanishes.

### 1.3 Diffusion coefficients and their pressure dependence

**Kinetic theory (Chapman–Enskog).** Tang et al. 2014 (ACP 14:9233, Eq. 6) give:

D(A,B,P) = 0.00266 T^1.5 / (P √M(A,B) σ² Ω_D), with D in cm² s⁻¹, P in bar and M(A,B) twice the reduced mass. **D ∝ 1/P at fixed T.**

**Fuller method.** Tang et al. 2014, Eqs. 7–8 and Table 1:

D(A,B)·P = 1.0868 T^1.75 / [√m(A,B) (V_A^1/3 + V_B^1/3)²], in Torr cm² s⁻¹, with m(A,B) = 2/(1/m_A + 1/m_B).

- Diffusion volumes: air 19.7; O₂ 16.3; C 15.9; H 2.31; O 6.11.
- 1.0868/760 = 0.00143 atm cm² s⁻¹.
- **Caveat:** Zhong et al. 2026 (Pharmaceutics 18:221, Eq. 9) write 0.00143·T^1.75·√(1/M_i + 1/M_air)/[P(…)²]. That form is √2 ≈ 1.41× too large compared with Tang's, as I confirmed numerically. Do not use it.
- A second citing paper gives the wrong Fuller DOI (…ie50677a006). The correct Fuller et al. 1966 DOI is 10.1021/ie50677a007.

**Empirical P and T scaling (Massman).** As reproduced by Miles et al. 2012 (J Phys Chem A 116:10810, Eq. 11, read from the equation image):

D(H₂O–air) = D₀ (p₀/p)(T/T₀)^α, with D₀ = 0.2178 cm² s⁻¹ at 273.15 K and 1 atm, α = 1.81 and ±7% uncertainty. The underlying data were "corrected to 1 atm pressure assuming an inverse pressure dependence".

**Practical rule for the twin.** Gas-phase D scales as 101.325/P_kPa, giving 1.45× at 70 kPa, 2.03× at 50 kPa, 4.05× at 25 kPa and 10.1× at 10 kPa. Liquid-phase D does not change with total pressure.

| Gas | D in air (m² s⁻¹) | Source / tier | D in water (m² s⁻¹) | Source / tier |
|---|---|---|---|---|
| O₂ | 2.10e-5 (model input); Fuller 2.02e-5 at 298 K, 1 atm | Retta 2023 / standard; Tang Eq. 7 / derived | 1.97e-9 at 25 °C | Retta 2023 (citing Denny 1993) / standard |
| CO₂ | 1.60e-5 at 20 °C; 1.57e-5 (Retta; Fuller) | Ho 2012 (citing Lide) / standard | 1.79e-9 at 298 K; 1.67e-9 at 20 °C; 1.89e-9 | Berghuijs 2017; Ho 2012; Retta 2023 / standard |
| C₂H₄ | 124 ± 5 Torr cm² s⁻¹ at 298 K → 1.63e-5 at 1 atm; Fuller 1.52e-5 | Tang 2015 Table 1 / standard + derived | **not_found** | — |
| H₂O | 0.2178 cm² s⁻¹ at 0 °C → 0.255 cm² s⁻¹ at 25 °C | Miles 2012 (Massman) / standard + derived | — | — |

Yamauchi et al. 2019 state that O₂ diffusivity in water is "approximately 10,000-fold slower than in air", which matches the table (≈1.07×10⁴). Fagerstedt et al. 2024 (J Exp Bot 75:1217) print the air and water values **swapped**, so do not cite their numbers.

### 1.4 Henry's-law solubility (Sander 2015, ACP 15:4399–4981, Table 6)

Values are H^cp in mol m⁻³ Pa⁻¹ at 298.15 K, with temperature dependence d ln H/d(1/T) in K. Sander Eq. 19 (p. 4403) gives the van 't Hoff form: H(T) = H° exp[(d ln H/d(1/T))(1/T − 1/298.15)].

| Species | H^cp | d ln H/d(1/T) | Page | Notes |
|---|---|---|---|---|
| O₂ | 1.3×10⁻⁵ | 1500 | 4408 | Agrees with Sander 2011, Battino 1983 and Wilhelm 1977. Warneck & Williams 2012 give 1.2×10⁻⁵/1700. Ho 2011 Plant Physiol gives 1.37×10⁻² mol m⁻³ kPa⁻¹ at 20 °C, consistent. |
| CO₂ | 3.3×10⁻⁴ | 2400 | 4488 | Physical solubility only, without the bicarbonate equilibria. |
| C₂H₄ | 5.9×10⁻⁵ (Sander 2011 entry) | 2200 | 4444 | **25% spread**: Wilhelm 1977 gives 4.7×10⁻⁵/1800, and the measured entries cluster at 4.6–4.9×10⁻⁵. Choose deliberately. |

Derived values (my arithmetic):
- Dimensionless H^cc = H^cp·RT: O₂ 0.032, CO₂ 0.818 (Ho 2012 independently gives 0.83), C₂H₄ 0.146 (0.117 with the Wilhelm value).
- Air-equilibrated water holds 0.276 mol m⁻³ O₂.
- 1 ppm ethylene at 101.3 kPa equilibrates to about 6.0 nM dissolved. At reduced total pressure the same ppm gives proportionally less.

## 2. Spaceflight ethylene

**Levine et al. 2000 (two papers, Adv Space Res 26(2)). Verified, but no numbers available.**
- **BRIC-100VC on Mir** (pp. 307–310): nine canisters of daylily embryogenic cultures, launched on STS-81 (12 Jan 1997) and returned on STS-84 (24 May 1997). The abstract says CO₂ and ethylene data "are presented" but gives none. An NTRS hardware sheet (Richards et al. 2016) adds that the daylily canisters held a 5% CO₂ gas fill for 4.5 months.
- **BRIC-60 GENEX on STS-87** (pp. 311–314): 192 soybean seeds; 4–7-day protocols; CO₂ and ethylene measured on the last day in space and at recovery. Again, no numbers in the abstract.
- Both full texts are paywalled and not on NTRS or PMC, so the CSV marks them **not_found**. They are the highest-priority values to pull by hand.

Other measured spaceflight and closed-chamber ethylene values:
- **Mir station atmosphere:** 1.1–1.7 µmol mol⁻¹ (ppm) before and during wheat flowering (Campbell et al. 2001). Ground exposure to ≥1 ppm reproduced 100% floret sterility.
- **Shuttle Plant Growth Unit**, 5 days, sweetpotato: < 10 nL L⁻¹, similar in flight and on the ground (Mortley et al. 2008).
- **BRIC-03 soybean:** "elevated post-flight ethylene", with no number given; GENEX levels were normal (Kuznetsov et al. 2001). On a ground clinostat at 1 rpm, soybean in BRIC produced twice the ethylene of stationary controls (Hilaire et al. 1996).
- **Advanced Plant Habitat:**
  - Ethylene is scrubbed to below 25 ppb by a KMnO₄ filter. This is a specification, not a flight measurement (Massa et al. 2016).
  - The permanganate (Purafil SP) beads also absorb CO₂, so ethylene control is turned off during CO₂ drawdowns (Monje et al. 2020).
  - The leak rate measured on ISS was 5% h⁻¹ (Monje et al. 2020). This is useful as the first-order exchange term in a sealed-chamber model.
- **KSC Biomass Production Chamber, ground** (Wheeler et al. 1996):
  - Peak ethylene was 120 ppb for wheat, 60 ppb for soybean and 40–50 ppb for lettuce and potato.
  - Stand production was 0.04–0.06 mL m⁻² d⁻¹.
  - **Unit conflict:** Wheeler et al. 2004 report 1.6–2.5 **nmol** m⁻² d⁻¹ for the same crops. By my arithmetic the 1996 figure is about 1.8–2.7 **µmol** m⁻² d⁻¹, roughly 1000× higher, so one abstract's unit is probably wrong. Read both full texts before using either.
- **KMnO₄ removal rate** (Rakow 1995, NASA/ASEE report, NTRS 19960020729; scanned and OCR'd):
  - 0.43 ppb h⁻¹ removed by 200 g of permanganate material in the BPC during potato growth.
  - About 4 kg would bring ethylene to a safe level within 8 h.
  - BPC leakage was 10% of chamber concentration per day; typical potato ethylene was 20–40 ppb, with removal triggered at 50–60 ppb.
- **not_found:**
  - photocatalytic scrubber removal rates for flight hardware
  - measured ethylene inside Veggie
  - ISS cabin ethylene
  - measured ethylene in Arabidopsis ABRS, PESTO or BRIC flights

## 3. Radiation → hormones, and dose rates

**Dose-rate environment:**

| Environment | Absorbed dose rate | Dose equivalent | Source |
|---|---|---|---|
| Lunar surface (Chang'E-4 LND, 2019, ~1 g cm⁻² shielding) | 13.2 ± 1 µGy h⁻¹ in Si (0.317 mGy d⁻¹, derived); neutrals 3.1 ± 0.5 µGy h⁻¹ | 1369 µSv d⁻¹; ⟨Q⟩ = 4.3 ± 0.7 | Zhang et al. 2020 Sci Adv |
| ISS (EAD TEPC, June 2017) | 314 ± 14 µGy d⁻¹ (GCR 146 ± 2; SAA 168 ± 14) | 758 ± 24 µSv d⁻¹ | Straube et al. 2024 |
| ISS (DOSIS 3D, early 2019) | — | 731 µSv d⁻¹ (GCR 523) | Zhang et al. 2020 |
| Interplanetary cruise (MSL-RAD) | 0.48 mGy d⁻¹ | 1.84 mSv d⁻¹ | Simonsen et al. 2020 (SECONDARY, citing Zeitlin et al.) |
| Mars surface (MSL-RAD) | 0.20 mGy d⁻¹ | 0.7 mSv d⁻¹ | Simonsen et al. 2020 (SECONDARY) |
| Reference SPE (Oct 1989), simulated inside Orion | peak 414 µGy min⁻¹ in the cabin vs 95 µGy min⁻¹ in the storm shelter; storm-shelter cap ≤ 150 mSv | — | George et al. 2024 Nature (model of a design event) |
| 30-day cislunar mission, GCR + Oct-1989 SPE | skin 722–1330 mGy behind 5 g cm⁻²; 115–188 mGy behind 20 g cm⁻² (GCR alone ≈ 8–11 mGy) | — | Shavers et al. 2024 (agency models) |

Zhang et al. 2020 call the lunar GCR value an upper limit for solar minimum, and note that SPEs "can increase the dose by orders of magnitude behind only thin shielding".

**Radiation → ethylene, ABA and ROS in plants.** The evidence is mostly qualitative.

- **Ethylene.** Nagata et al. 2004 gave Arabidopsis seedlings a massive 3 kGy gamma dose:
  - Ethylene production rose immediately and reached a steady level after about 2 h.
  - The ethylene-synthesis inhibitor AVG abolished the resulting root changes, and an antioxidant suppressed them, consistent with a ROS → ethylene route.
  - Fold change and dose rate are not in the abstract; the paper is paywalled.
- **Ethylene signalling at low dose.** Newman et al. 2023 (bioRxiv preprint) found responses at 10 cGy within 1 h, with ethylene signalling implicated through transcription and chromatin data rather than gas measurement.
- **ABA and ROS after seed gamma irradiation.** Qi et al. 2015 report that 50 Gy gave the largest growth stimulation, with endogenous ABA and H₂O₂ both increased. No fold changes are accessible.
- **ROS after carbon-ion irradiation.** Yin et al. (Front Plant Sci 14, Crossref year 2024) used ¹²C⁶⁺ ions at 80 MeV/u and 80 Gy min⁻¹ on seeds:
  - At 50 Gy, O₂·⁻ rose and growth was stimulated.
  - At 200 Gy, H₂O₂ rose and growth was inhibited.
  - Magnitudes appear only in their Fig. 5.
- **Chronic gamma.** Vandenhove et al. 2010 found that the dose rate causing a 10% growth reduction (EDR-10) is 60–80 µGy h⁻¹. They saw no oxidative-stress effect over dose rates of 81–2336 µGy h⁻¹, only a transient RBOHC gene response. For scale, the lunar surface is about 13 µGy h⁻¹.
- **Simulated GCR and SPE.** These studies (Dixit et al. 2023: 40 and 80 cGy on 10-day seedlings; Zhang et al. 2022: GCR up to 80 cGy and SPE up to 200 cGy on seeds) report transcriptomic and phenotypic effects but no hormone measurements.
- **not_found:** a numeric fold change in ethylene or ABA after irradiation, in any accessible text.

## 4. Seedling growth kinetics (Col-0)

**Boyes et al. 2001, Table 1** (plates; 0.5× MS, no sucrose; 22/20 °C; ~110 µmol m⁻² s⁻¹; 16-h light). Days are counted from sowing and include 3 days of stratification at 4 °C:

| Stage | Description | Days from sowing | Days after transfer to growth conditions (derived) |
|---|---|---|---|
| 0.10 | Imbibition | 3.0 | 0 |
| 0.50 | Radicle emergence | 4.3 ± 0.4 | 1.3 |
| 0.7 | Hypocotyl and cotyledon emergence | 5.5 ± 0.6 | 2.5 |
| 1.0 | Cotyledons fully open | 6.0 ± 0.5 | 3.0 |

The brief's DOI (10.1105/tpc.13.7.1499) and the canonical one (10.1105/tpc.010011) both resolve in Crossref to the same paper.

**Beemster & Baskin 1998.** These data cover **days 6–10 after plating**, not 0–5 days. Conditions were 20 °C under continuous 80 µmol m⁻² s⁻¹ light.

| Measure | Day 6 | Day 8 | Day 10 |
|---|---|---|---|
| Root elongation (µm h⁻¹) | 241 ± 6 | — | 445 ± 12 |
| Growth zone (µm) | 1231 | 1850 | 2337 |
| Meristem length (µm) | 440 | 488 | 713 |

- Elongation rate rises 16.6% per day.
- Cell cycle: 18.6 ± 0.7 h.
- Division rate: 0.041 cells cell⁻¹ h⁻¹.
- Cell flux: 1.68 cells h⁻¹ at day 6 and 2.55 at day 10.
- Strain rate is about 4% h⁻¹ at the apex.
- Kinematics for 0–5 days were not found.

**Alimchandani et al. 2026 multiscale growth atlas** (New Phytol 249:299–324; a meta-analysis that includes Gendreau 1997 data):

| Measure | Dark-grown | Light-grown |
|---|---|---|
| Final hypocotyl length (mm) | 17.1 ± 3.7 | 3.28 ± 1.68 |
| Maximum growth rate (mm d⁻¹) | 5.96 ± 1.53 | 1.11 ± 0.75 |
| Time of maximum rate (d) | 3.25 ± 0.72 | 3.70 ± 1.33 |
| Linear-phase duration (d) | ≈ 3.5 | — |

- Dark hypocotyls are already about 3× longer than light-grown ones at 2 DAG, with basal elongation of 200–300% d⁻¹.
- Root tip velocity in Col-0 averages 384 ± 119 µm h⁻¹ (range 87–626 across 18 studies).
- Root zones: meristem 333, transition 137, elongation 962 µm.
- Check the atlas supplement for the exact time zero.

**Gendreau 1997.** Its numbers are not_found; the scanned PDF could not be retrieved. Its qualitative finding is that the hypocotyl elongates without significant cell division. Dhar et al. 2022, citing Gendreau and Refrégier, give about a 100-fold increase in epidermal cell length in the dark.

**Triple response.**
- Guzmán & Ecker 1990: only the abstract was readable. It says eto1 makes "at least 40 times more ethylene" than wild type. Hypocotyl and root lengths with or without ethylene, and hook angle, are not_found.
- The only numeric baseline found: etiolated Col-0 hypocotyls are 11.83 ± 0.74 mm after 4 days in the dark without ACC (Li et al. 2024). Their ACC-treated values appear only in figures.

**Gravitropism.**
- Wild-type roots held at a constant angle respond at a maximum rate "approaching 30° h⁻¹" (Canaday et al. 2026, citing Wolverton et al. 2011; SECONDARY). The starchless pgm-1 mutant responds at 8° h⁻¹. This is not the same as free bending after a single 90° turn; free-bending rates for Col-0 appear only in figures (not_found).
- On the ISS EMCS centrifuge, Col-0 roots reached the full 1 g phenotype at only 0.011 g (Canaday et al. 2026).

**Seed O₂ threshold** (Brassica rapa; Park & Hasenstein 2016): germination is normal above 10% pO₂, with the radicle emerging about 18 h after imbibition.

## 5. Hypobaria

- **Arabidopsis, transcriptomes only, using pre-grown plants rather than germinating seeds:**
  - Paul et al. 2004: 24 h at 10 kPa air (pO₂ ≈ 2.1 kPa, derived) changed expression of more than 200 genes. Fewer than half overlapped with the hypoxia response, and many were ABA/drought-related.
  - Zhou et al. 2017 separated hypobaria from hypoxia with total-pressure/pO₂ combinations of 50/10, 25/5, 50/21, 25/21 and 97/5 kPa.
  - Richards et al. 2006: net photosynthesis rose as pressure fell from 101 to 10 kPa when CO₂ was limiting.
- **Germination and early growth, in other species:**
  - Lettuce germination was not reduced at 25 kPa, but was reduced at 6 kPa pO₂ (He & Davies 2012).
  - Lettuce at 70 kPa with pO₂ held at 21 kPa showed no detriment over the first 5 days or to 30 days (Spanarkel & Drew 2002).
  - Lettuce and wheat at 50 kPa grew more, with unchanged germination (He et al. 2003).
  - At 6 kPa pO₂, root growth fell 50–70% (He et al. 2007).
  - Wheat at 100–200 hPa gained 76% dry mass (Massimino & André 1999).
- **Ethylene at low pressure (conflict):**
  - He et al. 2003: ethylene production rate fell more than 65% at 30 kPa.
  - He et al. 2009: no significant reduction at 25 kPa.
  - No source I read states that low pressure **enhances ethylene removal**, so that statement is marked not_found.
- **Diffusion statements (qualitative):**
  - Iwabuchi & Kurata 2003 describe "enhancement of gas diffusion" at 25 kPa, which long-term-grown spinach offset with smaller stomata.
  - Rygalov et al. 2004 state that "Changes in pressure affect gas diffusion rates and surface boundary layers".
- **not_found:** Arabidopsis germination timing or seedling growth rate at reduced total pressure.

## 6. Caveats and conflicts to resolve before publication

1. **Ranz–Marshall coefficient:** 0.6 (Stiti 2022) vs 0.55 (Dbouk & Drikakis 2020). The 1952 original was not read.
2. **Churchill sphere correlation:** the exact form comes from a teaching web page. Check it against Churchill 1983 or a textbook before publication. One OA paper has a typo.
3. **Fuller equation:** use the m(A,B) = 2/(1/m_A + 1/m_B) form (Tang 2014). One 2026 paper's version is √2 too high.
4. **Ethylene Henry constant:** 5.9×10⁻⁵ (Sander 2011 review entry) vs 4.6–4.9×10⁻⁵ (Wilhelm 1977 and the measured entries).
5. **Wheeler BPC ethylene production units:** mL vs nmol, about 1000× apart.
6. **Hypobaric ethylene production:** He 2003 vs He 2009 disagree.
7. **Beemster & Baskin kinematics** cover days 6–10. Extending them to 0–5 days is extrapolation.
8. **Second-hand values:** the MSL-RAD numbers (via Simonsen 2020), the 30° h⁻¹ gravitropic rate (via Canaday 2026) and the 100-fold epidermal elongation (via Dhar 2022) were not checked against the primary papers.
9. **Rakow 1995** was read from OCR of a scanned report; check the page images before quoting.
10. **Paywalled or blocked full texts** whose values remain not_found: Levine 2000a/b, Nagata 2004, Qi 2015, Gendreau 1997 and Guzmán & Ecker 1990.
11. **Dose units:** Zhang 2020's lunar values are in **silicon** unless marked "water". The ISS EAD values are TEPC tissue-equivalent. Do not mix them without converting (Zhang 2020 uses a Si → water factor of 1.30 for charged-particle LET).

## Sources without DOI (read)

- Yovanovich, M.M. *Natural Convection from Isothermal Spheres* (NCSPH3.MWS worksheet). University of Waterloo MHTL course page: https://www.mhtlab.uwaterloo.ca/old/courses/me353/maple/nconv/ncsph31.html
- Rakow, A.L. (1995). *An analysis of alternative technologies for the removal of ethylene from the CELSS Biomass Production Chamber.* NASA/ASEE Summer Faculty Fellowship report, KSC. NTRS 19960020729: https://ntrs.nasa.gov/citations/19960020729
- Richards, S.E., Levine, H.G., Romero, V. (2016). *BRIC-100VC Biological Research in Canisters (BRIC)-100VC.* NTRS 20160005064: https://ntrs.nasa.gov/citations/20160005064
- Massa, G.D. et al. (2016). NTRS 20160006558, the conference version of the Acta Horticulturae paper listed below, used for the page-7 statement. Plant Habitat slides (Onate 2016, NTRS 20160009489) also state an ethylene limit of "< 25 ppb".

## Verified references (as recorded in Crossref)

- Stiti, Mehdi; Castanet, Guilaume; Corber, Andrew; Alden, Marcus; Berrocal, Edouard (2022). Transition from saliva droplets to solid aerosols in the context of COVID-19 spreading. *Environmental Research*, 204, 112072. https://doi.org/10.1016/j.envres.2021.112072
- Dbouk, Talib; Drikakis, Dimitris (2020). Weather impact on airborne coronavirus survival. *Physics of Fluids*, 32(9), 093312. https://doi.org/10.1063/5.0024272
- CHURCHILL, STUART W. (1983). COMPREHENSIVE, THEORETICALLY BASED, CORRELATING EQUATIONS FOR FREE CONVECTION FROM ISOTHERMAL SPHERES. *Chemical Engineering Communications*, 24(4-6), 339-352. https://doi.org/10.1080/00986448308940090
- Yuge, T. (1960). Experiments on Heat Transfer From Spheres Including Combined Natural and Forced Convection. *Journal of Heat Transfer*, 82(3), 214-220. https://doi.org/10.1115/1.3679912
- Zhen, Qi; Tana; Sun, Yunfeng; Yan, Caixia; Wang, Hongzhi (2024). Nu–Gr correlation for laminar natural convection heat transfer from a sphere submitted to a constant heat flux surface. *Scientific Reports*, 14(1), 16565. https://doi.org/10.1038/s41598-024-67382-2
- Sander, R. (2015). Compilation of Henry's law constants (version 4.0) for water as solvent. *Atmospheric Chemistry and Physics*, 15(8), 4399-4981. https://doi.org/10.5194/acp-15-4399-2015
- Tang, M. J.; Cox, R. A.; Kalberer, M. (2014). Compilation and evaluation of gas phase diffusion coefficients of reactive trace gases in the atmosphere: volume 1. Inorganic compounds. *Atmospheric Chemistry and Physics*, 14(17), 9233-9247. https://doi.org/10.5194/acp-14-9233-2014
- Tang, M. J.; Shiraiwa, M.; Pöschl, U.; Cox, R. A.; Kalberer, M. (2015). Compilation and evaluation of gas phase diffusion coefficients of reactive trace gases in the atmosphere: Volume 2. Diffusivities of organic compounds, pressure-normalised mean free paths, and average Knudsen numbers for gas uptake calculations. *Atmospheric Chemistry and Physics*, 15(10), 5585-5598. https://doi.org/10.5194/acp-15-5585-2015
- Miles, Rachael E. H.; Reid, Jonathan P.; Riipinen, Ilona (2012). Comparison of Approaches for Measuring the Mass Accommodation Coefficient for the Condensation of Water and Sensitivities to Uncertainties in Thermophysical Properties. *The Journal of Physical Chemistry A*, 116(44), 10810-10825. https://doi.org/10.1021/jp3083858
- Fuller, Edward N.; Schettler, Paul D.; Giddings, J. Calvin. (1966). NEW METHOD FOR PREDICTION OF BINARY GAS-PHASE DIFFUSION COEFFICIENTS. *Industrial & Engineering Chemistry*, 58(5), 18-27. https://doi.org/10.1021/ie50677a007
- Zhong, Zhihao; Lian, Guoping; Chen, Tao; Yu, Yuan (2026). Modelling Transdermal Permeation of Volatiles from Complex Product Formulations. *Pharmaceutics*, 18(2), 221. https://doi.org/10.3390/pharmaceutics18020221
- Ho, Quang Tri; Verboven, Pieter; Yin, Xinyou; Struik, Paul C.; Nicolaï, Bart M. (2012). A Microscale Model for Combined CO2 Diffusion and Photosynthesis in Leaves. *PLoS ONE*, 7(11), e48376. https://doi.org/10.1371/journal.pone.0048376
- Berghuijs, Herman N. C.; Yin, Xinyou; Ho, Q. Tri; Retta, Moges A.; Verboven, Pieter; Nicolaï, Bart M.; Struik, Paul C. (2017). Localization of (photo)respiration and CO2 re-assimilation in tomato leaves investigated with a reaction-diffusion model. *PLOS ONE*, 12(9), e0183746. https://doi.org/10.1371/journal.pone.0183746
- Retta, Moges A; Yin, Xinyou; Ho, Quang Tri; Watté, Rodrigo; Berghuijs, Herman N C; Verboven, Pieter; Saeys, Wouter; Cano, Francisco Javier; Ghannoum, Oula; Struik, Paul C; Nicolaï, Bart M (2023). The role of chloroplast movement in C4 photosynthesis: a theoretical analysis using a three-dimensional reaction–diffusion model for maize. *Journal of Experimental Botany*, 74(14), 4125-4142. https://doi.org/10.1093/jxb/erad138
- Ho, Quang Tri; Verboven, Pieter; Verlinden, Bert E.; Herremans, Els; Wevers, Martine; Carmeliet, Jan; Nicolaï, Bart M. (2011). A Three-Dimensional Multiscale Model for Gas Exchange in Fruit. *Plant Physiology*, 155(3), 1158-1168. https://doi.org/10.1104/pp.110.169391
- Yamauchi, Takaki; Abe, Fumitaka; Tsutsumi, Nobuhiro; Nakazono, Mikio (2019). Root Cortex Provides a Venue for Gas-Space Formation and Is Essential for Plant Adaptation to Waterlogging. *Frontiers in Plant Science*, 10, 259. https://doi.org/10.3389/fpls.2019.00259
- Fagerstedt, Kurt V; Pucciariello, Chiara; Pedersen, Ole; Perata, Pierdomenico (2024). Recent progress in understanding the cellular and genetic basis of plant responses to low oxygen holds promise for developing flood-resilient crops. *Journal of Experimental Botany*, 75(5), 1217-1233. https://doi.org/10.1093/jxb/erad457
- Levine, H.G.; Anderson, K.F.; Krikorian, A.D. (2000). The ‘gaseous’ environment in sealed BRIC-100VC canisters flown on ‘Mir’ with embryogenic daylily cell cultures. *Advances in Space Research*, 26(2), 307-310. https://doi.org/10.1016/s0273-1177(99)00576-1
- Levine, H.G.; Sharek, J.A.; Johnson, K.M.; Stryjewski, E.C.; Prima, V.I.; Martynenko, O.I.; Piastuch, W.C. (2000). Growth protocols for etiolated soybeans germinated within BRIC-60 canisters under spaceflight conditions. *Advances in Space Research*, 26(2), 311-314. https://doi.org/10.1016/s0273-1177(99)00577-3
- Kuznetsov, O.A.; Brown, C.S.; Levine, H.G.; Piastuch, W.C.; Sanwo-Lewandowski, M.M.; Hasenstein, K.H. (2001). Composition and physical properties of starch in microgravity-grown plants. *Advances in Space Research*, 28(4), 651-658. https://doi.org/10.1016/s0273-1177(01)00374-x
- Hilaire, E.; Peterson, B. V.; Guikema, J. A.; Brown, C. S. (1996). Clinorotation Affects Morphology and Ethylene Production in Soybean Seedlings. *Plant and Cell Physiology*, 37(7), 929-934. https://doi.org/10.1093/oxfordjournals.pcp.a029041
- Campbell, William F.; Salisbury, Frank B.; Bugbee, Bruce; Klassen, Steven; Naegle, Erin; Strickland, Darren T.; Bingham, Gail E.; Levinskikh, Margarita; Iljina, Galena M.; Veselova, Tatjana D.; Sytchev, Vladimir N.; Podolsky, Igor; McManus, William R.; Bubenheim, David L.; Stieber, Joseph; Jahns, Gary (2001). Comparative floral development of Mir-grown and ethylene-treated, earth-grown Super Dwarf wheat. *Journal of Plant Physiology*, 158(8), 1051-1060. https://doi.org/10.1078/s0176-1617(04)70129-7
- Mortley, Desmond G.; Bonsi, Conrad K.; Hill, Walter A.; Morris, Carlton E.; Williams, Carol S.; Davis, Ceyla F.; Williams, John W.; Levine, Lanfang H.; Petersen, Barbara V.; Wheeler, Raymond M. (2008). Influence of Microgravity Environment on Root Growth, Soluble Sugars, and Starch Concentration of Sweetpotato Stem Cuttings. *Journal of the American Society for Horticultural Science*, 133(3), 327-332. https://doi.org/10.21273/jashs.133.3.327
- Massa, G.D.; Wheeler, R.M.; Morrow, R.C.; Levine, H.G. (2016). Growth chambers on the International Space Station for large plants. *Acta Horticulturae*(1134), 215-222. https://doi.org/10.17660/actahortic.2016.1134.29
- Monje, Oscar; Richards, Jeffrey T.; Carver, John A.; Dimapilis, Dinah I.; Levine, Howard G.; Dufour, Nicole F.; Onate, Bryan G. (2020). Hardware Validation of the Advanced Plant Habitat on ISS: Canopy Photosynthesis in Reduced Gravity. *Frontiers in Plant Science*, 11, 673. https://doi.org/10.3389/fpls.2020.00673
- Wheeler, R.M.; Peterson, B.V.; Sager, J.C.; Knott, W.M. (1996). Ethylene production by plants in a closed environment. *Advances in Space Research*, 18(4-5), 193-196. https://doi.org/10.1016/0273-1177(95)00877-h
- Wheeler, Raymond M.; Peterson, Barbara V.; Stutte, Gary W. (2004). Ethylene Production throughout Growth and Development of Plants. *HortScience*, 39(7), 1541-1545. https://doi.org/10.21273/hortsci.39.7.1541
- Zhang, Shenyi; Wimmer-Schweingruber, Robert F.; Yu, Jia; Wang, Chi; Fu, Qiang; Zou, Yongliao; Sun, Yueqiang; Wang, Chunqin; Hou, Donghui; Böttcher, Stephan I.; Burmeister, Sönke; Seimetz, Lars; Schuster, Björn; Knierim, Violetta; Shen, Guohong; Yuan, Bin; Lohf, Henning; Guo, Jingnan; Xu, Zigong; Freiherr von Forstner, Johan L.; Kulkarni, Shrinivasrao R.; Xu, Haitao; Xue, Changbin; Li, Jun; Zhang, Zhe; Zhang, He; Berger, Thomas; Matthiä, Daniel; Hellweg, Christine E.; Hou, Xufeng; Cao, Jinbin; Chang, Zhen; Zhang, Binquan; Chen, Yuesong; Geng, Hao; Quan, Zida (2020). First measurements of the radiation dose on the lunar surface. *Science Advances*, 6(39), eaaz1334. https://doi.org/10.1126/sciadv.aaz1334
- Straube, Ulrich; Berger, Thomas; Dieckmann, Matthias (2024). The ESA Active Dosimeter (EAD) system onboard the International Space Station (ISS). *Zeitschrift für Medizinische Physik*, 34(1), 111-139. https://doi.org/10.1016/j.zemedi.2023.03.001
- Simonsen, Lisa C.; Slaba, Tony C.; Guida, Peter; Rusek, Adam (2020). NASA’s first ground-based Galactic Cosmic Ray Simulator: Enabling a new era in space radiobiology research. *PLOS Biology*, 18(5), e3000669. https://doi.org/10.1371/journal.pbio.3000669
- George, Stuart P.; Gaza, Ramona; Matthiä, Daniel; Laramore, Diego; Lehti, Jussi; Campbell-Ricketts, Thomas; Kroupa, Martin; Stoffle, Nicholas; Marsalek, Karel; Przybyla, Bartos; Abdelmelek, Mena; Aeckerlein, Joachim; Bahadori, Amir A.; Barzilla, Janet; Dieckmann, Matthias; Ecord, Michael; Egeland, Ricky; Eronen, Timo; Fry, Dan; Jones, Bailey H.; Hellweg, Christine E.; Houri, Jordan; Hirsh, Robert; Hirvonen, Mika; Hovland, Scott; Hussein, Hesham; Johnson, A. Steve; Kasemann, Moritz; Lee, Kerry; Leitgab, Martin; McLeod, Catherine; Milstein, Oren; Pinsky, Lawrence; Quinn, Phillip; Riihonen, Esa; Rohde, Markus; Rozhdestvenskyy, Sergiy; Saari, Jouni; Schram, Aaron; Straube, Ulrich; Turecek, Daniel; Virtanen, Pasi; Waterman, Gideon; Wheeler, Scott; Whitman, Kathryn; Wirtz, Michael; Vandewalle, Madelyn; Zeitlin, Cary; Semones, Edward; Berger, Thomas (2024). Space radiation measurements during the Artemis I lunar mission. *Nature*, 634(8032), 48-52. https://doi.org/10.1038/s41586-024-07927-7
- Shavers, Mark R.; Semones, Edward J.; Shurshakov, Vyacheslav; Dobynde, Mikhail; Sato, Tatsuhiko; Komiyama, Tatsuto; Tomi, Leena; Chen, Jing; El-Jaby, Samy; Straube, Ulrich; Li, Chunsheng; Rühm, Werner (2024). Comparison of dose and risk estimates between ISS Partner Agencies for a 30-day lunar mission. *Zeitschrift für Medizinische Physik*, 34(1), 31-43. https://doi.org/10.1016/j.zemedi.2023.10.005
- Nagata, Toshifumi; Todoriki, Setsuko; Kikuchi, Shoshi (2004). Radial Expansion of Root Cells and Elongation of Root Hairs of Arabidopsis thaliana Induced by Massive Doses of Gamma Irradiation. *Plant and Cell Physiology*, 45(11), 1557-1565. https://doi.org/10.1093/pcp/pch178
- Newman, Jeremy R B; Zhou, Mingqi; Pires, J. Chris; Bacher, Rhonda L; Kladde, Michael; Concannon, Patrick (2023). Multi-omics profiling reveals ethylene signalling as a key pathway underlying both genetic and epigenetic responses to low-dose ionizing radiation in Arabidopsis. *bioRxiv*. https://doi.org/10.1101/2023.10.14.562363
- Qi, Wencai; Zhang, Liang; Feng, Weisen; Xu, Hangbo; Wang, Lin; Jiao, Zhen (2015). ROS and ABA Signaling Are Involved in the Growth Stimulation Induced by Low-Dose Gamma Irradiation in Arabidopsis Seedling. *Applied Biochemistry and Biotechnology*, 175(3), 1490-1506. https://doi.org/10.1007/s12010-014-1372-6
- Yin, Yue; Cui, Dongjie; Chi, Qing; Xu, Hangbo; Guan, Panfeng; Zhang, Hanfeng; Jiao, Tao; Wang, Xiaojie; Wang, Lin; Sun, Hao (2024). Reactive oxygen species may be involved in the distinctive biological effects of different doses of 12C6+ ion beams on Arabidopsis. *Frontiers in Plant Science*, 14, 1337640. https://doi.org/10.3389/fpls.2023.1337640
- Vandenhove, Hildegarde; Vanhoudt, Nathalie; Cuypers, Ann; van Hees, May; Wannijn, Jean; Horemans, Nele (2010). Life-cycle chronic gamma exposure of Arabidopsis thaliana induces growth effects but no discernable effects on oxidative stress pathways. *Plant Physiology and Biochemistry*, 48(9), 778-786. https://doi.org/10.1016/j.plaphy.2010.06.006
- Dixit, Anirudha R.; Meyers, Alexander D.; Richardson, Brian; Richards, Jeffrey T.; Richards, Stephanie E.; Neelam, Srujana; Levine, Howard G.; Cameron, Mark J.; Zhang, Ye (2023). Simulated galactic cosmic ray exposure activates dose-dependent DNA repair response and down regulates glucosinolate pathways in arabidopsis seedlings. *Frontiers in Plant Science*, 14, 1284529. https://doi.org/10.3389/fpls.2023.1284529
- Zhang, Ye; Richards, Jeffrey T.; Feiveson, Alan H.; Richards, Stephanie E.; Neelam, Srujana; Dreschel, Thomas W.; Plante, Ianik; Hada, Megumi; Wu, Honglu; Massa, Gioia D.; Douglas, Grace L.; Levine, Howard G. (2022). Response of Arabidopsis thaliana and Mizuna Mustard Seeds to Simulated Space Radiation Exposures. *Life*, 12(2), 144. https://doi.org/10.3390/life12020144
- Gendreau, E.; Traas, J.; Desnos, T.; Grandjean, O.; Caboche, M.; Hofte, H. (1997). Cellular Basis of Hypocotyl Growth in Arabidopsis thaliana. *Plant Physiology*, 114(1), 295-305. https://doi.org/10.1104/pp.114.1.295
- Beemster, Gerrit T.S.; Baskin, Tobias I. (1998). Analysis of Cell Division and Elongation Underlying the Developmental Acceleration of Root Growth inArabidopsis thaliana1. *Plant Physiology*, 116(4), 1515-1526. https://doi.org/10.1104/pp.116.4.1515
- Boyes, Douglas C.; Zayed, Adel M.; Ascenzi, Robert; McCaskill, Amy J.; Hoffman, Neil E.; Davis, Keith R.; Görlach, Jörn (2001). Growth Stage–Based Phenotypic Analysis of Arabidopsis. *The Plant Cell*, 13(7), 1499-1510. https://doi.org/10.1105/tpc.010011
- Boyes, D. C. (2001). Growth Stage-Based Phenotypic Analysis of Arabidopsis: A Model for High Throughput Functional Genomics in Plants. *THE PLANT CELL ONLINE*, 13(7), 1499-1510. https://doi.org/10.1105/tpc.13.7.1499
- Guzmán, P; Ecker, J R (1990). Exploiting the triple response of Arabidopsis to identify ethylene-related mutants.. *The Plant Cell*, 2(6), 513-523. https://doi.org/10.1105/tpc.2.6.513
- Guzman, Plinio; Ecker, Joseph R. (1990). Exploiting the Triple Response of Arabidopsis to Identify Ethylene-Related Mutants. *The Plant Cell*, 2(6), 513. https://doi.org/10.2307/3869113
- Alimchandani, Viraj; Branchini, Elvis; Routier‐Kierzkowska, Anne‐Lise (2026). A multiscale growth atlas of Arabidopsis: linking cell dynamics to organ development. *New Phytologist*, 249(1), 299-324. https://doi.org/10.1111/nph.70576
- Dhar, Souvik; Kim, Jinkwon; Yoon, Eun Kyung; Jang, Sejeong; Ko, Kangseok; Lim, Jun (2022). SHORT-ROOT Controls Cell Elongation in the Etiolated Arabidopsis Hypocotyl. *Molecules and Cells*, 45(4), 243-256. https://doi.org/10.14348/molcells.2021.5008
- Li, Yuke; Cheng, Ying; Wei, Fan; Liu, Yingxiao; Zhu, Ruojia; Zhao, Pingxia; Zhang, Jing; Xiang, Chengbin; Kang, Erfang; Shang, Zhonglin (2024). Arabidopsis thaliana MYC2 and MYC3 Are Involved in Ethylene-Regulated Hypocotyl Growth as Negative Regulators. *International Journal of Molecular Sciences*, 25(15), 8022. https://doi.org/10.3390/ijms25158022
- Canaday, Emma L J; Meyers, Alexander; Scinto-Madonich, Nathan J; Wyatt, Sarah E; Wolverton, Chris (2026). Physiological and transcriptomic assessment of Arabidopsis identifies two distinct gravity signaling systems. *Plant Physiology*, 200(3), kiag095. https://doi.org/10.1093/plphys/kiag095
- Park, Myoung Ryoul; Hasenstein, Karl H. (2016). Oxygen dependency of germinating Brassica seeds. *Life Sciences in Space Research*, 8, 30-37. https://doi.org/10.1016/j.lssr.2016.01.002
- Paul, Anna-Lisa; Schuerger, Andrew C.; Popp, Michael P.; Richards, Jeffrey T.; Manak, Michael S.; Ferl, Robert J. (2004). Hypobaric Biology: Arabidopsis Gene Expression at Low Atmospheric Pressure. *Plant Physiology*, 134(1), 215-223. https://doi.org/10.1104/pp.103.032607
- Zhou, Mingqi; Callaham, Jordan B.; Reyes, Matthew; Stasiak, Michael; Riva, Alberto; Zupanska, Agata K.; Dixon, Mike A.; Paul, Anna-Lisa; Ferl, Robert J. (2017). Dissecting Low Atmospheric Pressure Stress: Transcriptome Responses to the Components of Hypobaria in Arabidopsis. *Frontiers in Plant Science*, 8. https://doi.org/10.3389/fpls.2017.00528
- Richards, Jeffrey T.; Corey, Kenneth A.; Paul, Anna-Lisa; Ferl, Robert J.; Wheeler, Raymond M.; Schuerger, Andrew C. (2006). Exposure of Arabidopsis thaliana to Hypobaric Environments: Implications for Low-Pressure Bioregenerative Life Support Systems for Human Exploration Missions and Terraforming on Mars. *Astrobiology*, 6(6), 851-866. https://doi.org/10.1089/ast.2006.6.851
- He, Chuanjiu; Davies, Fred T.; Lacey, Ronald E.; Drew, Malcolm C.; Brown, Denise L. (2003). Effect of hypobaric conditions on ethylene evolution and growth of lettuce and wheat. *Journal of Plant Physiology*, 160(11), 1341-1350. https://doi.org/10.1078/0176-1617-01106
- He, Chuanjiu; Davies, Fred T.; Lacey, Ronald E. (2007). Separating the effects of hypobaria and hypoxia on lettuce: growth and gas exchange. *Physiologia Plantarum*, 131(2), 226-240. https://doi.org/10.1111/j.1399-3054.2007.00946.x
- He, Chuanjiu; Davies, Fred T.; Lacey, Ronald E. (2009). Ethylene reduces gas exchange and growth of lettuce plants under hypobaric and normal atmospheric conditions. *Physiologia Plantarum*, 135(3), 258-271. https://doi.org/10.1111/j.1399-3054.2008.01190.x
- He, Chuanjiu; Davies, Fred T. (2012). Ethylene reduces plant gas exchange and growth of lettuce grown from seed to harvest under hypobaric and ambient total pressure. *Journal of Plant Physiology*, 169(4), 369-378. https://doi.org/10.1016/j.jplph.2011.11.002
- Spanarkel, Robert; Drew, Malcolm C. (2002). Germination and growth of lettuce (Lactuca sativa) at low atmospheric pressure. *Physiologia Plantarum*, 116(4), 468-477. https://doi.org/10.1034/j.1399-3054.2002.1160405.x
- Iwabuchi, K.; Kurata, K. (2003). Short-term and long-term effects of low total pressure on gas exchange rates of spinach. *Advances in Space Research*, 31(1), 241-244. https://doi.org/10.1016/s0273-1177(02)00743-3
- Rygalov, Vadim Y.; Fowler, Philip A.; Wheeler, Raymond M.; Bucklin, Ray A. (2004). WATER CYCLE AND ITS MANAGEMENT FOR PLANT HABITATS AT REDUCED PRESSURES. *Habitation*, 10(1), 49-59. https://doi.org/10.3727/154296604774808865
- Massimino, D.; André, M. (1999). Growth of wheat under one tenth of the atmospheric pressure. *Advances in Space Research*, 24(3), 293-296. https://doi.org/10.1016/s0273-1177(99)00316-6

### Cited only as pointers or caveats (Crossref-verified; abstract only, or flagged for an error)

- Wheeler, R.M.; Mackowiak, C.L.; Stutte, G.W.; Sager, J.C.; Yorio, N.C.; Ruffe, L.M.; Fortson, R.E.; Dreschel, T.W.; Knott, W.M.; Corey, K.A. (1996). NASA's biomass production chamber: A testbed for bioregenerative life support studies. *Advances in Space Research*, 18(4-5), 215-224. https://doi.org/10.1016/0273-1177(95)00880-n
- Strickland, Hunter F.; Jacobson, Talia; Smith, Grace; Voiniciuc, Cătălin; Schuerger, Andrew C.; Paul, Anna‐Lisa; Ferl, Robert (2026). Hypobaric Resilience of Matrix Polysaccharide Biosynthesis in Plants. *Plant Direct*, 10(10), e70190. https://doi.org/10.1002/pld3.70190
- Sánchez-García, Rubén E.; Castilleja-Escobedo, Orlando; Salmón-Folgueras, Rodrigo; López-Salinas, José Luis (2024). Modeling of cooking and phase change of egg white using computational fluid dynamics. *Current Research in Food Science*, 9, 100872. https://doi.org/10.1016/j.crfs.2024.100872
