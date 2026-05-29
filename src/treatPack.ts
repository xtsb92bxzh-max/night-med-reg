import type { Consequence, LocationId } from "./types";

export interface TreatTemplate {
  id: string;
  locationIds: LocationId[];
  message: string;
  flavour: string;
  consequence: Consequence;
}

export const treatTemplates: TreatTemplate[] = [
  // Cardiology
  {
    id: "cardio_tunnocks",
    locationIds: ["cardiology"],
    message: "Tunnock's teacakes on the cardiology desk",
    flavour:
      "A tin appeared from somewhere. Nobody claimed it. The foil is intact.",
    consequence: { stamina: 8, score: 20 },
  },
  {
    id: "cardio_tea",
    locationIds: ["cardiology"],
    message: "Mug of tea, no questions asked",
    flavour:
      "The night HCA caught you looking rough and made one anyway. Milk already in. You didn't ask.",
    consequence: { caffeine: 10, focus: 4, score: 18 },
  },
  // Respiratory
  {
    id: "resp_biscuits",
    locationIds: ["respiratory"],
    message: "Half a pack of digestives at the nurses' station",
    flavour:
      "From the Christmas tin, probably. It is not Christmas. Nobody cares.",
    consequence: { stamina: 6, score: 15 },
  },
  {
    id: "resp_nespresso",
    locationIds: ["respiratory"],
    message: "Strong coffee from the respiratory office",
    flavour:
      "The night shift lead has a Nespresso machine nobody officially knows about. Tonight you're in.",
    consequence: { caffeine: 14, focus: 6, score: 22 },
  },
  // ICU
  {
    id: "icu_filter_coffee",
    locationIds: ["icu"],
    message: "Proper filter coffee in the ICU office",
    flavour:
      "The ITU charge nurse made a full pot. You have been included without needing to ask.",
    consequence: { caffeine: 16, focus: 8, score: 24 },
  },
  {
    id: "icu_birthday_cake",
    locationIds: ["icu"],
    message: "Birthday cake going spare in the ICU office",
    flavour:
      "Someone's birthday. Carrot cake, very good. They insist on a second slice.",
    consequence: { stamina: 12, score: 25 },
  },
  // MAU
  {
    id: "mau_quality_street",
    locationIds: ["mau"],
    message: "Quality Street tin materialised on the MAU desk",
    flavour:
      "Provenance: unknown. Contents: mostly toffee pennies at this stage, but still.",
    consequence: { stamina: 7, focus: 3, score: 18 },
  },
  {
    id: "mau_cupasoap",
    locationIds: ["mau"],
    message: "Cup-a-Soup from the MAU kitchen",
    flavour:
      "The ward clerk keeps a stash for emergencies. She has decided this counts.",
    consequence: { stamina: 9, score: 16 },
  },
  // COTE (elderly)
  {
    id: "cote_soup",
    locationIds: ["elderly"],
    message: "Mug of proper soup from the COTE kitchen",
    flavour:
      "'You look terrible,' says an HCA, handing it to you without further comment. It is correct.",
    consequence: { stamina: 14, reputation: 1, score: 22 },
  },
  {
    id: "cote_galaxy",
    locationIds: ["elderly"],
    message: "Bar of Galaxy left by a patient's family",
    flavour:
      "Note attached: 'For the night staff — thank you for everything.' You are the night staff.",
    consequence: { stamina: 9, reputation: 1, score: 25 },
  },
  // Surgical
  {
    id: "surgical_haribo",
    locationIds: ["surgical"],
    message: "Haribo share bag, still half full",
    flavour:
      "Surgical SpR left it at handover. 'Help yourself,' they said. You will.",
    consequence: { stamina: 5, focus: 4, score: 14 },
  },
  {
    id: "surgical_jaffa",
    locationIds: ["surgical"],
    message: "Jaffa Cakes at the surgical nurses' station",
    flavour:
      "The charge nurse keeps a private stash for genuine emergencies. Apparently this qualifies.",
    consequence: { stamina: 7, score: 16 },
  },
  // ED Resus
  {
    id: "ed_paramedic",
    locationIds: ["ed_resus"],
    message: "Biscuit offered by a paramedic crew",
    flavour: "From their own bag. 'Take two,' they say. Small mercies at 3am.",
    consequence: { stamina: 6, score: 15 },
  },
  {
    id: "ed_vending_twix",
    locationIds: ["ed_resus"],
    message: "Twix dropped free from the ED vending machine",
    flavour: "It dispensed twice. You have decided not to investigate further.",
    consequence: { stamina: 8, caffeine: 3, score: 18 },
  },
  // Radiology
  {
    id: "radiology_cake",
    locationIds: ["radiology"],
    message: "Night radiographer sharing birthday cake",
    flavour:
      "Carrot cake. Extremely good. They will not accept one slice as sufficient.",
    consequence: { stamina: 12, score: 22 },
  },
  {
    id: "radiology_hobnobs",
    locationIds: ["radiology"],
    message: "HobNobs in the reporting room",
    flavour:
      "It is unclear who bought them. It is entirely clear they are the correct biscuit.",
    consequence: { stamina: 6, focus: 3, score: 15 },
  },
  // Pharmacy
  {
    id: "pharmacy_percy_pigs",
    locationIds: ["pharmacy"],
    message: "On-call pharmacist offers Percy Pigs",
    flavour:
      "'Help yourself,' they say, turning back to the TPN query. You help yourself.",
    consequence: { stamina: 8, focus: 4, score: 18 },
  },
  // Estates
  {
    id: "estates_tea",
    locationIds: ["estates"],
    message: "Builder's tea from the estates team",
    flavour:
      "Strong enough to stand a spoon in. Handed over without comment or conditions.",
    consequence: { caffeine: 12, stamina: 5, score: 16 },
  },
  // Generic — any ward
  {
    id: "generic_night_staff_chocolate",
    locationIds: [],
    message: "Chocolate left at the nurses' station for night staff",
    flavour:
      "Sticky note: 'FOR THE NIGHT TEAM — thank you.' You are the night team.",
    consequence: { stamina: 8, score: 20 },
  },
  {
    id: "generic_kettle",
    locationIds: [],
    message: "Night staff put the kettle on and included you",
    flavour:
      "You didn't ask. They saw you and just handed it over. NHS solidarity, quietly enacted.",
    consequence: { caffeine: 8, focus: 4, stamina: 3, score: 18 },
  },
  {
    id: "generic_biscuit_tin",
    locationIds: [],
    message: "Ward biscuit tin, apparently unguarded",
    flavour:
      "Origin unknown. Contents: assorted. Possibly from a grateful discharge. You were not told to ask.",
    consequence: { stamina: 6, score: 14 },
  },
  {
    id: "generic_leftover_sandwiches",
    locationIds: [],
    message: "Leftover sandwiches from a day team meeting",
    flavour:
      "Still sealed. 'They're just going in the bin otherwise,' says the ward clerk.",
    consequence: { stamina: 11, score: 20 },
  },
];
