import type { Recipe } from './model';

export interface Plate {
  readonly id: string;
  readonly file: string;
  readonly alt: string;
  readonly artist: string;
  readonly license: string;
  readonly source: string;
}

const PLATES = {
  chana: plate('chana', 'chana.jpg', 'Chickpeas in a tomato sauce with flatbread and samosas', 'Andy Li', 'CC0', 'https://commons.wikimedia.org/wiki/File:Chana_Masala_-_Mohammed_-_Spice_Of_Life_2024-05-27.jpg'),
  rajma: plate('rajma', 'rajma.jpg', 'Kidney beans, rice, and yogurt on a steel plate', 'Medhi jyoti', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Rajma_Chawal_Thali.jpg'),
  palak: plate('palak', 'palak.jpg', 'Spinach paneer in a pot beside rice and raita', 'Lopanayak', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Palakpaneer_Rayagada_Odisha_0009.jpg'),
  tikka: plate('tikka', 'tikka.jpg', 'Grilled paneer with tomato and lime', 'Sonja Pauen -Stanhopea', 'CC BY 2.0 de', 'https://commons.wikimedia.org/wiki/File:Panir_Tikka_Indian_cheese_grilled.jpg'),
  dal: plate('dal', 'dal.jpg', 'Yellow dal with cream and a piece of naan', 'Wind Hashira', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Dal_tadka_and_naan.jpg'),
  biryani: plate('biryani', 'biryani.jpg', 'Spiced vegetable rice with peas', 'Phadke09', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Vegetable_Biryani_IMG_001.jpg'),
  tacos: plate('tacos', 'tacos.jpg', 'Black bean and vegetable tacos with avocado', 'Jennifer from Vancouver, Canada', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Vegetables_and_Black_Bean_Tacos_(7212559656).jpg'),
  'sweet-tacos': plate('sweet-tacos', 'sweet-tacos.jpg', 'Sweet potato and black bean tacos', 'Karen and Brad Emerson', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Roasted_sweet_potato_%2B_black_bean_tacos_(7784822910).jpg'),
  quesadilla: plate('quesadilla', 'quesadilla.jpg', 'A folded cheese quesadilla', 'Corn cheese', 'CC0', 'https://commons.wikimedia.org/wiki/File:Cheese_quesadilla.jpg'),
  enchilada: plate('enchilada', 'enchilada.jpg', 'Enchiladas with salsa, sour cream, and avocado', 'Gerardolagunes', 'CC0', 'https://commons.wikimedia.org/wiki/File:Vegetarian_Mexican_enchiladas_with_green_salsa_cheese_sour_cream_and_avocado_20260823_162514_(9).jpg'),
  hummus: plate('hummus', 'hummus.jpg', 'A stuffed flatbread with hummus, tomato, and onion', 'Satdeep Gill', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Homemade_hummus_and_pita_03.jpg'),
  pasta: plate('pasta', 'pasta.jpg', 'Pasta under a chunky tomato sauce', '10Rosso', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Pasta_al_pomodoro_2.jpg'),
  lasagna: plate('lasagna', 'lasagna.jpg', 'A baked pasta dish with spinach and melted cheese', 'FloGalsen', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Vegetarian-lasagna_.jpg'),
  bibimbap: plate('bibimbap', 'bibimbap.jpg', 'A vegetable bibimbap pot with banchan', 'Guilhem Vellut from Paris, France', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Vegetarian_Dolsot_Bibimbap,_Jeongane,_Paris_002.jpg'),
  'fried-rice': plate('fried-rice', 'fried-rice.jpg', 'Egg fried rice with peas and carrot', 'Gary Dee', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Fried_Rice_1_(Eggs_%26_Vegetables).jpg'),
  mac: plate('mac', 'mac.jpg', 'Baked macaroni and cheese in a pot', 'Dave Walker from Royal Oak, MI, USA', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Homemade_macaroni_and_cheese.jpg'),
  burger: plate('burger', 'burger.jpg', 'A vegetable burger with onion, tomato, and sweet potato fries', 'heliosphan', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Veggie_burger_with_fries_cc_flickr_user_heliosphan.jpg'),
  pizza: plate('pizza', 'pizza.jpg', 'A margherita pizza with basil', 'Mario56', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Margherita_Originale.JPG'),
  tofu: plate('tofu', 'tofu.jpg', 'Crispy tofu with herbs and chili', 'Andy Li', 'CC0', 'https://commons.wikimedia.org/wiki/File:Crispy_Tofu_-_Stir_Fry_by_CK_2025-04-06.jpg'),
  thai: plate('thai', 'thai.jpg', 'Green curry with tofu, cauliflower, and basil', 'Daderot', 'CC0', 'https://commons.wikimedia.org/wiki/File:Green_curry_with_cauliflowers,_seasonal_vegetables,_bamboo_shoots,_and_chili_crisp_-_San_Francisco,_CA.jpg'),
  noodles: plate('noodles', 'noodles.jpg', 'Tofu over peanut noodles with salad', 'Karen and Brad Emerson', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Spicy_peanut_tofu_(3660634348).jpg'),
  quinoa: plate('quinoa', 'quinoa.jpg', 'A quinoa bowl with tomatoes and herbs', 'Ella Olsson from Stockholm, Sweden', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Vegan_Quinoa_Bowl_(44040185371).jpg'),
  risotto: plate('risotto', 'risotto.jpg', 'Creamy rice with mushrooms', 'Elfer', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Risotto_prepared_with_mushrooms_and_scallions_(cropped).jpg'),
  eggs: plate('eggs', 'eggs.jpg', 'Eggs cooked in a pepper and tomato skillet', 'Calliopejen1', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:Shakshuka_by_Calliopejen1.jpg'),
  nachos: plate('nachos', 'nachos.jpg', 'Nachos with beans, cheese sauce, and lettuce', 'Navajcmer', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:The_Beanery_Nachos.jpg'),
  minestrone: plate('minestrone', 'minestrone.jpg', 'Vegetable minestrone with pasta', 'Vegan Feast Catering', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Vegetable_Minestrone_(3383467369).jpg'),
  potatoes: plate('potatoes', 'potatoes.jpg', 'Mashed potatoes with butter and chives', 'Jon Sullivan', 'Public domain', 'https://commons.wikimedia.org/wiki/File:Mashed_potatoes_butter_chives_food_dinner_cooking.jpg'),
  'rice-beans': plate('rice-beans', 'rice-beans.jpg', 'Beans in sauce over rice', 'daSupremo', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Rice_and_beans_stew_in_bowl.jpg'),
  burrito: plate('burrito', 'burrito.jpg', 'A vegetable burrito with potatoes and guacamole', 'Stephan Mosel from Innsbruck, Austria', 'CC BY 2.0', 'https://commons.wikimedia.org/wiki/File:Veggie_Burrito_Nuremberg.jpg'),
  chole: plate('chole', 'chole.jpg', 'Chickpea curry with fried bread, onion, and lime', 'Gannu03', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Chole_Bhature_5.jpg'),
} as const satisfies Record<string, Plate>;

export type PlateId = keyof typeof PLATES;

function plate(id: string, file: string, alt: string, artist: string, license: string, source: string): Plate {
  return { id, file, alt, artist, license, source };
}

const MATCHERS: readonly { readonly id: PlateId; readonly test: (haystack: string) => boolean }[] = [
  { id: 'pizza', test: (haystack) => haystack.includes('pizza') },
  { id: 'quesadilla', test: (haystack) => /quesadilla|crunchwrap|tortilla skillet/.test(haystack) },
  { id: 'enchilada', test: (haystack) => haystack.includes('enchilada') },
  { id: 'nachos', test: (haystack) => haystack.includes('nacho') },
  { id: 'burger', test: (haystack) => haystack.includes('burger') },
  { id: 'bibimbap', test: (haystack) => haystack.includes('bibimbap') },
  { id: 'fried-rice', test: (haystack) => haystack.includes('fried rice') },
  { id: 'biryani', test: (haystack) => /biryani|pulao/.test(haystack) },
  { id: 'chole', test: (haystack) => /chole|chaat/.test(haystack) },
  { id: 'rajma', test: (haystack) => haystack.includes('rajma') || (haystack.includes('kidney') && haystack.includes('indian')) },
  { id: 'palak', test: (haystack) => haystack.includes('palak') },
  { id: 'tikka', test: (haystack) => /tikka|kathi/.test(haystack) },
  { id: 'eggs', test: (haystack) => (haystack.includes('bhurji') || /\begg\b/.test(haystack)) && !/taco|pita|torta|salad/.test(haystack) },
  { id: 'mac', test: (haystack) => /\bmac\b/.test(haystack) },
  { id: 'noodles', test: (haystack) => haystack.includes('noodle') },
  { id: 'minestrone', test: (haystack) => haystack.includes('soup') && !/pita|wrap/.test(haystack) },
  { id: 'risotto', test: (haystack) => /risotto|creamy rice/.test(haystack) },
  { id: 'lasagna', test: (haystack) => /lasagna|pasta bake|ziti|stuffed shell|mozzarella bake/.test(haystack) },
  { id: 'pasta', test: (haystack) => haystack.includes('pasta') },
  { id: 'sweet-tacos', test: (haystack) => haystack.includes('sweet potato') && /taco|burrito|wrap/.test(haystack) },
  { id: 'burrito', test: (haystack) => /burrito|fajita/.test(haystack) },
  { id: 'tacos', test: (haystack) => /taco|torta/.test(haystack) },
  { id: 'quinoa', test: (haystack) => haystack.includes('quinoa') && !/wrap|pita|shawarma/.test(haystack) },
  { id: 'hummus', test: (haystack) => /hummus|shawarma|mezze|pita|banh|wrap/.test(haystack) && !/bowl|rice/.test(haystack) },
  { id: 'thai', test: (haystack) => /curry/.test(haystack) && (/thai/.test(haystack) || (/coconut/.test(haystack) && !/lentil|dal|indian/.test(haystack))) },
  { id: 'dal', test: (haystack) => /khichdi|\bdal\b|red lentil|urad|masoor|mujaddara/.test(haystack) },
  { id: 'chana', test: (haystack) => /chana|chickpea/.test(haystack) && /curry|stew|tagine|masala|indian|moroccan/.test(haystack) && !/peanut|west african/.test(haystack) },
  { id: 'rice-beans', test: (haystack) => /cajun|cuban|caribbean|west african|peanut|kidney|rice and bean|beans and rice/.test(haystack) },
  { id: 'sweet-tacos', test: (haystack) => haystack.includes('sweet potato') },
  { id: 'potatoes', test: (haystack) => /potato|shepherd|mash/.test(haystack) },
  { id: 'tofu', test: (haystack) => haystack.includes('tofu') },
  { id: 'eggs', test: (haystack) => /\begg\b/.test(haystack) },
  { id: 'fried-rice', test: (haystack) => /east asian|korean|thai|japanese|vietnamese|hawaiian/.test(haystack) },
  { id: 'pasta', test: (haystack) => haystack.includes('italian') },
  { id: 'tacos', test: (haystack) => /mexican|tex-mex/.test(haystack) },
  { id: 'tikka', test: (haystack) => haystack.includes('paneer') },
  { id: 'dal', test: (haystack) => haystack.includes('indian') },
  { id: 'quinoa', test: () => true },
];

export function plateSrc(entry: Plate): string {
  return `${import.meta.env.BASE_URL}plates/${entry.file}`;
}

export function plateCredit(entry: Plate): string {
  const artist = entry.artist.replace(/ from .+$/, '');
  return `${artist} · ${entry.license}`;
}

export function plateForRecipe(recipe: Pick<Recipe, 'id' | 'title' | 'cuisine' | 'tags'>): Plate {
  const haystack = `${recipe.id} ${recipe.title} ${recipe.cuisine} ${recipe.tags.join(' ')}`.toLowerCase();
  const match = MATCHERS.find((candidate) => candidate.test(haystack));
  return PLATES[match?.id ?? 'quinoa'];
}
