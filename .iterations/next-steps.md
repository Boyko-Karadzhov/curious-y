- no prev boss questions. Don't mention "Boss" in the prompts
- knowledgeEntry - remove questionContent.knowledgeEntry. Boss questions are not revealing anything in the DAG, concept question just reveal what we have already generated on various dimensions

------------
- Merge ux, whole unit ux;
- indicate in unit collection where you have extras available for merge;

- manual code review;

- knowledge tower/library bonuses should be more substantial. Mastering concepts is hard yet the most important part;

- bad mobile ui on knowledge graph;

----
[
  {
    "id": "boss-265baa16-8085-43fd-a274-db6c49e1c4a1",
    "kind": "boss",
    "title": "Imagine a multicellular animal mutation that permanently prevents the asymmetric distribution of cytoplasmic determinants during the very first embryonic cell division after fertilization. Based on first principles of developmental biology, what is the most direct consequence for the resulting multicellular organism?",
    "topic": "Life",
    "facets": [
      "mechanism"
    ],
    "topics": [
      "Life"
    ],
    "expanded": false,
    "requires": [],
    "curriculum": {
      "angle": "First principles — explain from fundamental rules",
      "subtopic": "Development & reproduction",
      "assessment": {
        "question": "Imagine a multicellular animal mutation that permanently prevents the asymmetric distribution of cytoplasmic determinants during the very first embryonic cell division after fertilization. Based on first principles of developmental biology, what is the most direct consequence for the resulting multicellular organism?",
        "explanation": "From a first-principles perspective, multicellular development requires breaking initial cellular symmetry to generate diverse cell lineages from a single zygote. In many organisms, this is achieved by localizing specific cytoplasmic determinants (such as transcription factors or localized mRNAs) to specific regions of the egg or zygote. When the cell divides, the cleavage plane partitions these determinants unequally into the daughter cells. Consequently, the two new cells find themselves in different internal chemical environments, activating distinct genetic programs. If this asymmetric partitioning is entirely abolished, the immediate daughter cells receive identical internal instructions, rendering them incapable of establishing the primary embryonic axes and initiating differential tissue development.",
        "wrongAnswers": [
          {
            "text": "The cells will undergo uncontrolled rapid division because cell cycle checkpoints depend strictly on symmetric division.",
            "feedback": "Incorrect. Cell cycle checkpoints monitor DNA integrity and spindle attachment rather than the symmetry of cytoplasmic determinant distribution."
          },
          {
            "text": "The embryo will develop normally because neighboring cells can always compensate through stochastic random differentiation.",
            "feedback": "Incorrect. While some regulative development occurs later, the initial breaking of symmetry relies on deterministic intracellular cues. Total loss of early asymmetry prevents the foundational spatial patterning required for embryonic organization."
          },
          {
            "text": "DNA replication will immediately cease in both daughter cells due to an instantaneous depletion of nuclear envelope proteins.",
            "feedback": "Incorrect. Cytoplasmic determinants are typically regulatory RNA or proteins that influence gene expression and cell fate, not structural components required directly for baseline DNA replication."
          }
        ],
        "correctAnswer": {
          "text": "The daughter cells will receive identical regulatory molecules, preventing the establishment of the initial cell fates required for proper body axis formation.",
          "feedback": "Correct. Asymmetric division ensures that different daughter cells inherit distinct transcription factors or mRNA determinants, which triggers differential gene expression. Without this, the early blastomeres remain equivalent and cannot establish fundamental body axes."
        },
        "knowledgeEntry": "Development and reproduction depend on fundamental cellular mechanisms that transform a single-celled zygote into a complex multicellular organism. A primary driver of early embryonic development is the establishment of polarity and the asymmetric division of the cell. Cytoplasmic determinants—molecules such as specific mRNAs and proteins anchored or localized to particular regions of the cytoplasm—are partitioned unequally during cleavage divisions. This unequal distribution ensures that daughter cells receive different regulatory signals, leading to differential gene expression and cell fate specification. Disrupting this foundational asymmetry halts the hierarchical cascade of positional information and tissue differentiation necessary for multicellular life.",
        "suggestedQuestions": [
          "How do localized maternal mRNAs establish anterior-posterior polarity in Drosophila embryos?",
          "What role do cell-cell signaling pathways play in refining cell fates after initial asymmetric divisions?",
          "How does chromatin remodeling facilitate stable changes in gene expression during early lineage commitment?"
        ]
      },
      "preparation": {
        "names": [
          "Asymmetric cell division",
          "Cytoplasmic determinants",
          "Embryonic axis formation",
          "Cell fate specification",
          "Differential gene expression",
          "Zygote cleavage"
        ],
        "stage": "match"
      }
    },
    "definition": "Development and reproduction depend on fundamental cellular mechanisms that transform a single-celled zygote into a complex multicellular organism. A primary driver of early embryonic development is the establishment of polarity and the asymmetric division of the cell. Cytoplasmic determinants—molecules such as specific mRNAs and proteins anchored or localized to particular regions of the cytoplasm—are partitioned unequally during cleavage divisions. This unequal distribution ensures that daughter cells receive different regulatory signals, leading to differential gene expression and cell fate specification. Disrupting this foundational asymmetry halts the hierarchical cascade of positional information and tissue differentiation necessary for multicellular life.",
    "requiredMasteryIds": [],
    "prerequisiteConcepts": []
  }
]