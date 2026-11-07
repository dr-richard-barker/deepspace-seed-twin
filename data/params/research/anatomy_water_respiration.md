# Seed anatomy, imbibition water uptake and respiration: parameter sourcing notes

Compiled 2026-11-06 for the deepspace-seed-twin (germinating *Arabidopsis thaliana* seed, Col-0 where possible).
Companion table: `anatomy_water_respiration.csv` (71 rows: 48 measured, 4 derived, 19 not_found).

## How this was sourced

- Searched with the Europe PMC REST API. Full texts were read from Europe PMC `fullTextXML` (open-access subset) or from the PMC HTML article page.
- I checked every quote in the CSV against the downloaded text with a script. The match ignores whitespace: non-breaking spaces are written as normal spaces, and table cells are joined with single spaces. Each quote is under 20 words.
- Every DOI below was checked against `api.crossref.org/works/<DOI>`. Where Crossref's "issued" year differs from the print year, both are shown.
- **Not read (access blocked):**
  - The PMC PDF of Gendreau 1997 sits behind a proof-of-work bot check. I did not bypass it, and OUP shows the abstract only.
  - Joosen 2010 (GERMINATOR) and Sew 2013 return Wiley HTTP 403.
  - Vander Willigen 2006 is OUP subscription only.
  - The Bassel 2014 supplementary PDF returns PNAS HTTP 403.

  For these papers only the abstracts were used, and the CSV notes say so.

## What was found

### 1. Seed and covering-layer anatomy
- **Dry Col-0 seed (Klasen et al. 2025, Table 3, control batch, n≈99):**
  - Mass 22.1 µg (SD 2.92) and volume 20.5 nl (SD 2.69).
  - Length 0.49 mm, width 0.31 mm, height 0.27 mm. Sphericity 94.5 %.
  - Derived: density ≈1.08 g cm⁻³. A triaxial ellipsoid built from L×W×H gives 21.5 nl, within 5 % of the measured volume, so an ellipsoid is a fair geometric proxy.
  - Seeds from mother plants grown at 26 °C were about 12–13 % heavier and larger.
  - Caution: Klasen's Table 2 labels comparable volume values as "[mm³]". This is evidently a unit slip, since Table 3 uses nl.
- **Testa:** develops from **5 integument cell layers**: oi1, oi2 (the mucilage-secreting layer), ii1, ii1′ and ii2 (Hyvärinen et al. 2025; also Demonsais et al. 2020 and Xu et al. 2017). **No numeric thickness was found for Arabidopsis.**
- **Endosperm:** a **single cell layer** under the testa (Dekkers et al. 2013). **No micropylar-endosperm thickness** was found for Arabidopsis or Lepidium.
- **Mucilage:** Col-0 mucilage has **two layers**, an outer water-soluble layer and an inner adherent layer with cellulose in its inner domain (Sullivan et al. 2011). It is released rapidly on imbibition (Saez-Aguayo et al. 2025). **No thickness in µm** was found; papers give only qualitative widths from ruthenium-red images.
- **Gas spaces in the dry seed** (Cloetens et al. 2006, Col): the intercellular void volume fraction is 1.5×10⁻² in the hypocotyl and 0.58×10⁻² in the cotyledons. Both are upper bounds. The voids form longitudinal air channels through the hypocotyl cortex and are absent from the epidermis and provasculature.

### 2. Embryo cellular anatomy
- **Cell counts in the mature embryo axis** (Montenegro-Johnson et al. 2015, Table 1, 3 samples):

  | Tissue | Cells (mean ± SD) |
  |---|---|
  | Epidermis | 837 ± 43 |
  | Outer cortex | 394 ± 21 |
  | Inner cortex | 203 ± 25 |
  | Endodermis | 239 ± 48 |

  - Derived sum: 1,673 cells. This excludes vasculature, root cap/columella, the shoot meristem and the cotyledons, so it is a lower bound for the axis only.
  - **No whole-embryo cell total was found.** The methods do not name the ecotype.
- **Radial layers in the hypocotyl** (Jackson et al. 2017, Col/Ler/Cvi): epidermis (trichoblast and atrichoblast files), then outer cortex, inner cortex, endodermis and vasculature. That is **2 cortical layers**. **No layer count was found for the radicle or root cap.**
- **Epidermal cells per file:**
  - **Gendreau et al. 1997 could not be read** (see access notes above).
  - Open-access alternative: Bou Daher et al. 2018 report that non-dividing (GL2-expressing) epidermal files have **17–19 cells** from collet to cotyledon base. These are dark-grown seedlings at 24 h after germination, and the genetic background is not stated.
- **Bassel et al. 2014** (Col, after-ripened 1 month, 4 embryos per time point):
  - Germination involves no cell division.
  - Relative cortical expansion over 3–22 HAI peaks around **cortical cell 8** (radicle/collet).
  - The first absolute expansion occurs in the lower hypocotyl at **16–22 HAI**, at the same time as visible testa rupture.
  - The final expansion phase at **28–32 HAI** drives endosperm rupture.
  - **Per-cell volumes and fold-expansion by cell index are figure-only** (Fig. 1F, Fig. 2A–D, Figs S3–S4). Expansion was measured over 3–16, 3–22, 3–28 and 3–32 HAI. The 6 HAI time point was used only for promoter–GUS images.
  - The FEM model inputs (wall Young's modulus 120 MPa, exterior wall 1 µm, interior wall 400 nm, turgor 0.5 MPa) are recorded in the CSV but flagged **MODEL INPUT**. Bassel attribute them to their ref. 30, not to measurements in this paper.

### 3. Imbibition and water relations
- **Hydrotime for non-dormant Col-0** (Footitt et al. 2019; after 3 d at 5 °C, germinated at 15 °C in light on PEG):
  - **ψb(50) = −1.272 MPa**
  - **σψb = 0.222**
  - **θH = 34.352 MPa·h**. The paper prints the unit as "MPa hr⁻¹"; hydrotime is dimensionally MPa·h.
- **Effect of blocking aquaporins** (Vander Willigen et al. 2006, abstract only): 5 µM HgCl₂ delays testa rupture by 8–9 h and radicle emergence by 25–30 h. The authors conclude that aquaporins act in phase III, not phase I.
- **Water-content time course: figure-only.** It appears in Choi et al. 2020 (Fig. 1b, 3a; Col-0, 22 °C) and Dekkers et al. 2013 (Fig. 1C). No numeric triphasic curve, end-of-phase-I time, dry-seed water content, measured dry-seed ψ or testa hydraulic conductivity was found in text.
- **Derived dry-seed ψ ≈ −163 MPa.** This uses the Kelvin equation with the 30 % RH / 20 °C after-ripening storage of Gran et al. 2025, and assumes the seed has equilibrated. It is not a measurement.

### 4. Respiration and O₂
- **Arabidopsis germinating seeds** (Nietzel et al. 2020, plate reader, 25 °C):
  - O₂ consumption starts **immediately** on adding water, but only relative units are reported.
  - Cytosolic MgATP rises with a half-time of **34 ± 2 min** and plateaus at about 70 min.
  - Adenylate energy charge goes from **0.2** in dry seed to **0.6** after 1 h.
- **Absolute O₂-uptake rates during germination are figure-only:**
  - Heidorn-Czarna et al. 2018, Fig. 11A: Col-0, Clark electrode at 30 °C, 0–42 h, nmol O₂ min⁻¹ mg DW⁻¹. Its methods give the sample size inconsistently, as "ten to twenty micrograms" in one place and "10–20 mg" in another.
  - Gerna et al. 2021, Fig. 4: 21 °C, 2–3 h.
  - Shinozaki et al. 2024, Fig. 5A: endosperm plus seed coat.
- **Developing (not germinating) Col-0 seeds** (Thiel et al. 2011): 1.7 ± 0.2 pmol µg⁻¹ min⁻¹ in air, falling to 0.73 ± 0.13 after 1 h at 10.5 kPa O₂. Use these only as an order-of-magnitude anchor.
- **No internal O₂ measurement for imbibed or germinating Arabidopsis seeds was found**, and none for Arabidopsis testa O₂ diffusivity.
- **Proxy only (*Brassica napus*, developing seed at about 30 DAF; Verboven et al. 2013):**
  - Lowest internal O₂ about 3 µM.
  - Apparent O₂ diffusivity: seed coat 60.6×10⁻⁹ m² s⁻¹ (porosity 14.2 %), cotyledon mesophyll 0.149×10⁻⁹, hypocotyl 93.2×10⁻⁹ axial and 0.184×10⁻⁹ radial.
  - These diffusivities are modelled from CT microstructure, not measured directly.
- **No germination dose–response to %O₂ was found for Arabidopsis.** Buijs et al. 2018 concerns *elevated* pO₂ during dry storage.

### 5. Germination calibration data
- **Dekkers et al. 2013** (Col-0, 0.7 % water agarose, 22 °C, continuous light):
  - Testa rupture starts about **20 h** after sowing and is nearly complete by **31 h**.
  - Endosperm rupture starts at **31 h** and is complete in the whole population by **45 h**, so Gmax ≈ 100 %.
  - These are the best calibration points stated in text.
- **Choi et al. 2020** (Col-0, 2 d at 4 °C, then 22 °C in continuous light): germination starts at 12 h after stratification and is almost complete by 36 h.
- **Footitt et al. 2019:** more than 95 % by 48 h at 25 °C in light after cold treatment.
- **Bassel et al. 2014:** testa rupture at 16–22 HAI and endosperm rupture driven by 28–32 HAI.
- **Joosen et al. 2010 (GERMINATOR) could not be read** (paywalled). Its abstract gives no genotype-specific t50 or Gmax.
- Open-access GERMINATOR users (Nadal Bigas et al. 2025; Gran et al. 2025) report t50 only in figures. **No text-stated Col-0 t50 was found.**

## Caveats
- The time origin differs between studies: hours after sowing, after stratification or after imbibition, with or without stratification. Convert before pooling. The Dekkers 2013 methods paragraph does not state any pre-treatment.
- Temperatures differ: 15 °C for the hydrotime fit, 21–30 °C for respiration, 22 °C for the germination curves. The hydrotime constant is temperature-specific.
- Brassica napus O₂ values come from a larger, developing seed. Treat them as structural analogues only.
- The two "MODEL INPUT" rows from Bassel 2014 are not empirical measurements, even though their tier is "measured" (the value was read from text).
- Figure-only values could be digitised later. Mark them as `derived` if you do.

## Verified reference list (Crossref)

1. Bassel, G.W., Stamm, P., Mosca, G., Barbier de Reuille, P., Gibbs, D.J., Winter, R., Janka, A., Holdsworth, M.J., Smith, R.S. (2014). Mechanical constraints imposed by 3D cellular geometry and arrangement modulate growth patterns in the *Arabidopsis* embryo. *Proceedings of the National Academy of Sciences* 111(23):8685–8690. doi:10.1073/pnas.1404616111
2. Bou Daher, F., Chen, Y., Bozorg, B., Clough, J., Jönsson, H., Braybrook, S.A. (2018). Anisotropic growth is achieved through the additive mechanical effect of material anisotropy and elastic asymmetry. *eLife* 7:e38161. doi:10.7554/eLife.38161
3. Buijs, G., Kodde, J., Groot, S.P.C., Bentsink, L. (2018). Seed dormancy release accelerated by elevated partial pressure of oxygen is associated with DOG loci. *Journal of Experimental Botany* 69(15):3601–3608. doi:10.1093/jxb/ery156
4. Choi, M.-G., Kim, E.J., Song, J.-Y., Choi, S.-B., Cho, S.-W., Park, C.S., Kang, C.-S., Park, Y.-I. (2020). Peptide transporter2 (PTR2) enhances water uptake during early seed germination in *Arabidopsis thaliana*. *Plant Molecular Biology* 102(6):615–624. doi:10.1007/s11103-020-00967-3
5. Cloetens, P., Mache, R., Schlenker, M., Lerbs-Mache, S. (2006). Quantitative phase tomography of *Arabidopsis* seeds reveals intercellular void network. *Proceedings of the National Academy of Sciences* 103(39):14626–14630. doi:10.1073/pnas.0603490103
6. Dekkers, B.J.W., Pearce, S., van Bolderen-Veldkamp, R.P., Marshall, A., Widera, P., Gilbert, J., Drost, H.-G., Bassel, G.W., Müller, K., King, J.R., Wood, A.T.A., Grosse, I., Quint, M., Krasnogor, N., Leubner-Metzger, G., Holdsworth, M.J., Bentsink, L. (2013). Transcriptional dynamics of two seed compartments with opposing roles in Arabidopsis seed germination. *Plant Physiology* 163(1):205–215. doi:10.1104/pp.113.223511
7. Demonsais, L., Utz-Pugin, A., Loubéry, S., Lopez-Molina, L. (2020). Identification of tannic cell walls at the outer surface of the endosperm upon Arabidopsis seed coat rupture. *The Plant Journal* 104(3):567–580. doi:10.1111/tpj.14994
8. Footitt, S., Clewes, R., Feeney, M., Finch-Savage, W.E., Frigerio, L. (2019). Aquaporins influence seed dormancy and germination in response to stress. *Plant, Cell & Environment* 42(8):2325–2339. doi:10.1111/pce.13561
9. Gendreau, E., Traas, J., Desnos, T., Grandjean, O., Caboche, M., Hofte, H. (1997). Cellular basis of hypocotyl growth in *Arabidopsis thaliana*. *Plant Physiology* 114(1):295–305. doi:10.1104/pp.114.1.295. **Abstract only. The full text was not read.**
10. Gerna, D., Arc, E., Holzknecht, M., Roach, T., Jansen-Dürr, P., Weiss, A.K.H., Kranner, I. (2021). AtFAHD1a: a new player influencing seed longevity and dormancy in Arabidopsis? *International Journal of Molecular Sciences* 22(6):2997. doi:10.3390/ijms22062997
11. Gran, P., Visscher, T.W., Bai, B., Nijveen, H., Mahboubi, A., Bakermans, L.L., Willems, L.A.J., Bentsink, L. (2025). Unravelling the dynamics of seed-stored mRNAs during seed priming. *New Phytologist* 247(5):2196–2209. doi:10.1111/nph.70098
12. Griffiths, M., Gautam, B., Lebow, C., Duncan, K., Ding, X., Handakumbura, P., Sedbrook, J.C., Topp, C.N. (2025). Evaluation of 3D seed structure and cellular traits in-situ using X-ray microscopy. *Scientific Reports* 15:4532. doi:10.1038/s41598-025-88482-7. Mentioned only, for pennycress testa context.
13. Heidorn-Czarna, M., Domanski, D., Kwasniak-Owczarek, M., Janska, H. (2018). Targeted proteomics approach toward understanding the role of the mitochondrial protease FTSH4 in the biogenesis of OXPHOS during Arabidopsis seed germination. *Frontiers in Plant Science* 9:821. doi:10.3389/fpls.2018.00821
14. Hyvärinen, L., Fuchs, C., Utz-Pugin, A., Gully, K., Megies, C., Holbein, J., Iwasaki, M., Demonsais, L., Capitão, M.B., Barberon, M., Franke, R.B., Nawrath, C., Loubéry, S., Lopez-Molina, L. (2025). Temperature-dependent polar lignification of a seed coat suberin layer promoting dormancy in *Arabidopsis thaliana*. *Proceedings of the National Academy of Sciences* 122(6):e2413627122. doi:10.1073/pnas.2413627122
15. Jackson, M.D.B., Xu, H., Duran-Nebreda, S., Stamm, P., Bassel, G.W. (2017). Topological analysis of multicellular complexity in the plant hypocotyl. *eLife* 6:e26023. doi:10.7554/eLife.26023
16. Joosen, R.V.L., Kodde, J., Willems, L.A.J., Ligterink, W., van der Plas, L.H.W., Hilhorst, H.W.M. (Crossref issued 2009-12-22; print 2010). GERMINATOR: a software package for high-throughput scoring and curve fitting of Arabidopsis seed germination. *The Plant Journal* 62(1):148–159. doi:10.1111/j.1365-313x.2009.04116.x. **Abstract only. The full text was not read.**
17. Klasen, D., Fischbach, A., Sydoruk, V., Kochs, J., Bühler, J., Koller, R., Huber, G. (2025). Seed-to-plant-tracking: automated phenotyping of seeds and corresponding plants of Arabidopsis. *Frontiers in Plant Science* 16:1539424. doi:10.3389/fpls.2025.1539424
18. Montenegro-Johnson, T.D., Stamm, P., Strauss, S., Topham, A.T., Tsagris, M., Wood, A.T.A., Smith, R.S., Bassel, G.W. (2015). Digital single-cell analysis of plant organ development using 3DCellAtlas. *The Plant Cell* 27(4):1018–1033. doi:10.1105/tpc.15.00175
19. Nadal Bigas, J., Fiers, M., van der Wal, F., Willems, L.A.J., Willemsen, V., Nijveen, H., Angenent, G.C., Immink, R.G.H. (2025). The PEBP genes FLOWERING LOCUS T and TERMINAL FLOWER 1 modulate seed dormancy and size. *Journal of Experimental Botany* 76(4):1049–1067. doi:10.1093/jxb/erae466
20. Nietzel, T., Mostertz, J., Ruberti, C., Née, G., Fuchs, P., Wagner, S., Moseler, A., Müller-Schüssele, S.J., Benamar, A., Poschet, G., Büttner, M., Møller, I.M., Lillig, C.H., Macherel, D., Wirtz, M., Hell, R., Finkemeier, I., Meyer, A.J., Hochgräfe, F., Schwarzländer, M. (Crossref issued 2019-12-23; vol. 117 is 2020). Redox-mediated kick-start of mitochondrial energy metabolism drives resource-efficient seed germination. *Proceedings of the National Academy of Sciences* 117(1):741–751. doi:10.1073/pnas.1910501117
21. Saez-Aguayo, S., Sanhueza, D., Jara, V., Galleguillos, B., de la Rubia, A.G., Largo-Gosens, A., Moreno, A. (2025). Mucilicious methods: navigating the tools developed to Arabidopsis seed coat mucilage analysis. *The Cell Surface* 13:100134. doi:10.1016/j.tcsw.2024.100134
22. Sew, Y.S., Ströher, E., Holzmann, C., Huang, S., Taylor, N.L., Jordana, X., Millar, A.H. (2013). Multiplex micro-respiratory measurements of Arabidopsis tissues. *New Phytologist* 200(3):922–932. doi:10.1111/nph.12394. **Not read (HTTP 403).**
23. Shinozaki, D., Takayama, E., Kawakami, N., Yoshimoto, K. (2024). Autophagy maintains endosperm quality during seed storage to preserve germination ability in *Arabidopsis*. *Proceedings of the National Academy of Sciences* 121(14):e2321612121. doi:10.1073/pnas.2321612121
24. Steinbrecher, T., Voegele, A., Ignatz, M., Weitbrecht, K., Khan, S., Graeber, K., Hourston, J.E., Leubner-Metzger, G. (2025). Distinct molecular biomechanical mechanisms inhibit endosperm cell-wall weakening and seed germination at cold and warm nonoptimal temperatures. *Plant, Cell & Environment* 48(11):8047–8067. doi:10.1111/pce.70103
25. Sullivan, S., Ralet, M.-C., Berger, A., Diatloff, E., Bischoff, V., Gonneau, M., Marion-Poll, A., North, H.M. (2011). CESA5 is required for the synthesis of cellulose with a role in structuring the adherent mucilage of Arabidopsis seeds. *Plant Physiology* 156(4):1725–1739. doi:10.1104/pp.111.179077
26. Thiel, J., Rolletschek, H., Friedel, S., Lunn, J.E., Nguyen, T.H., Feil, R., Tschiersch, H., Müller, M., Borisjuk, L. (2011). Seed-specific elevation of non-symbiotic hemoglobin AtHb1: beneficial effects and underlying molecular networks in *Arabidopsis thaliana*. *BMC Plant Biology* 11:48. doi:10.1186/1471-2229-11-48
27. Vander Willigen, C., Postaire, O., Tournaire-Roux, C., Boursiac, Y., Maurel, C. (2006). Expression and inhibition of aquaporins in germinating Arabidopsis seeds. *Plant and Cell Physiology* 47(9):1241–1250. doi:10.1093/pcp/pcj094. **Abstract only.**
28. Verboven, P., Herremans, E., Borisjuk, L., Helfen, L., Ho, Q.T., Tschiersch, H., Fuchs, J., Nicolaï, B.M., Rolletschek, H. (2013). Void space inside the developing seed of *Brassica napus* and the modelling of its function. *New Phytologist* 199(4):936–947. doi:10.1111/nph.12342
29. Viudes, S., Dunand, C., Burlat, V. (2021). Myxospermy evolution in Brassicaceae: a highly complex and diverse trait with Arabidopsis as an uncommon model. *Cells* 10(9):2470. doi:10.3390/cells10092470
30. Xu, W., Bobet, S., Le Gourrierec, J., Grain, D., De Vos, D., Berger, A., Salsac, F., Kelemen, Z., Boucherez, J., Rolland, A., Mouille, G., Routaboul, J.M., Lepiniec, L., Dubos, C. (2017). TRANSPARENT TESTA 16 and 15 act through different mechanisms to control proanthocyanidin accumulation in Arabidopsis testa. *Journal of Experimental Botany* 68(11):2859–2870. doi:10.1093/jxb/erx151
