import type { DietStatus, Product, VegetarianEligibility } from './model';

const BLOCKED_PATTERNS = [
  /\bbeef\b/i,
  /\bveal\b/i,
  /\bpork\b/i,
  /\bbacons?\b/i,
  /\bham\b/i,
  /\bprosciutto\b/i,
  /\bpancetta\b/i,
  /\bpepperoni\b/i,
  /\bsalamis?\b/i,
  /\bbologna\b/i,
  /\bmortadella\b/i,
  /\bpastrami\b/i,
  /\bsausages?\b/i,
  /\bchorizo\b/i,
  /\bbriskets?\b/i,
  /\bhot\s*dogs?\b/i,
  /\bfrankfurters?\b/i,
  /\bwieners?\b/i,
  /\bspareribs?\b/i,
  /\bribs?\b/i,
  /\bscrapple\b/i,
  /\bspam\b/i,
  /\bjerky\b/i,
  /\bsteaks?\b/i,
  /\bchickens?\b(?!\s+eggs?\b)/i,
  /\bturkeys?\b(?!\s+eggs?\b)/i,
  /\bducks?\b(?!\s+eggs?\b)/i,
  /\bgeese?\b(?!\s+eggs?\b)/i,
  /\bgoose\b(?!\s+eggs?\b)/i,
  /\bhens?\b(?!\s+eggs?\b)/i,
  /\bquails?\b(?!\s+eggs?\b)/i,
  /\bpheasants?\b(?!\s+eggs?\b)/i,
  /\bpoultry\b(?!\s+seasoning\b)/i,
  /\blamb\b/i,
  /\bmutton\b/i,
  /\bgoat\b(?!\s*(?:['’]s\s+)?(?:cheese|milk|yogurt|yoghurt)\b)/i,
  /\bvenison\b/i,
  /\brabbits?\b/i,
  /\bbisons?\b/i,
  /\belk\b/i,
  /\bwild boars?\b/i,
  /\boxtails?\b/i,
  /\bcarnitas\b/i,
  /\bmeat\b/i,
  /\bmeatballs?\b/i,
  /\bmeatloaf\b/i,
  /\bgelatin(?:e)?\b/i,
  /\blard\b/i,
  /\btallow\b/i,
  /\banimal fat\b/i,
  /\b(?:animal|meat|poultry|chicken|turkey|beef|pork|lamb|mutton|goat|fish|seafood|shellfish|bone) (?:stocks?|broths?|bouillons?)\b/i,
  /\bbone broths?\b/i,
  /\bfish(?:es)?\b/i,
  /\bseafoods?\b/i,
  /\bsalmons?\b/i,
  /\btunas?\b/i,
  /\bbonitos?\b/i,
  /\bcods?\b/i,
  /\bhaddocks?\b/i,
  /\btilapias?\b/i,
  /\btrouts?\b/i,
  /\bmackerels?\b/i,
  /\bhalibuts?\b/i,
  /\bpollocks?\b/i,
  /\bherrings?\b/i,
  /\bcatfish(?:es)?\b/i,
  /\bswordfish(?:es)?\b/i,
  /\bsnappers?\b/i,
  /\beels?\b/i,
  /\banchov(?:y|ies)\b/i,
  /\bsardines?\b/i,
  /\bshrimps?\b/i,
  /\bprawns?\b/i,
  /\bcrabs?\b/i,
  /\blobsters?\b/i,
  /\boysters?\b(?!\s+mushrooms?\b)/i,
  /\bclams?\b/i,
  /\bmussels?\b/i,
  /\bscallops?\b/i,
  /\bsquids?\b/i,
  /\boctop(?:us|uses|i)\b/i,
  /\bcalamari\b/i,
  /\bcrawfish(?:es)?\b/i,
  /\bcrayfish(?:es)?\b/i,
  /\bshellfish(?:es)?\b/i,
  /\bsurimi\b/i,
  /\bcrab\s*sticks?\b/i,
  /\bcaviar\b/i,
  /\bfish roes?\b/i,
  /\bfish sauce\b/i,
  /\boyster sauce\b/i,
  /\bcarmine\b/i,
  /\bcochineal\b/i,
  /\bshellac\b/i,
  /\bconfectioner(?:\s+s)?\s+glaze\b/i,
];

const REVIEW_PATTERNS = [
  /\brennet\b/i,
  /\benzymes?\b/i,
  /\bnatural flavo(?:u)?r(?:ing)?s?\b/i,
  /\bshortening\b/i,
  /\bmono-? and diglycerides\b/i,
];

const PROVIDER_VEGETARIAN_TAGS = [
  'vegetarian',
  'vegan',
  'certified-vegetarian',
  'certified-vegan',
  'certified-plant-based',
  'plant-based-certified',
  'v-label-vegetarian',
  'v-label-vegan',
];

const PROVIDER_BLOCKED_TAGS = [
  'non-vegetarian',
  'not-vegetarian',
  'contains-meat',
  'contains-poultry',
  'contains-fish',
  'contains-shellfish',
];

const PROVIDER_UNCERTAIN_TAGS = [
  'maybe-vegetarian',
  'vegetarian-status-unknown',
  'unknown-vegetarian-status',
  'may-not-be-vegetarian',
];

const CERTIFIED_ANALOG_TAGS = [
  'certified-vegetarian',
  'certified-vegan',
  'certified-plant-based',
  'plant-based-certified',
  'v-label-vegetarian',
  'v-label-vegan',
];
const PROVIDER_ANALOG_REASON = 'The provider certifies this plant-based analog and no blocked ingredient was found.';
const ANALOG_CUE_PATTERN = /\b(?:vegan|vegetarian|veggie|plant based|meatless|meat free|mock|animal free)\b/i;
const ANALOGABLE_ANIMAL_TERMS = /\b(?:beef|veal|pork|bacon|ham|prosciutto|pancetta|pepperoni|salami|bologna|mortadella|pastrami|sausage|chorizo|brisket|hot dog|frankfurter|wiener|sparerib|rib|scrapple|spam|jerky|steak|chicken|turkey|duck|goose|geese|hen|quail|pheasant|poultry|lamb|mutton|goat|venison|rabbit|bison|elk|wild boar|oxtail|carnitas|meat|meatball|meatloaf|fish|seafood|salmon|tuna|bonito|cod|haddock|tilapia|trout|mackerel|halibut|pollock|herring|catfish|swordfish|snapper|eel|anchovy|sardine|shrimp|prawn|crab|lobster|oyster|clam|mussel|scallop|squid|octopus|octopi|calamari|crawfish|crayfish|shellfish|surimi|caviar)s?\b/gi;

export interface DietCheckInput {
  readonly name: string;
  readonly ingredientsText?: string;
  readonly labels?: readonly string[];
  readonly analysisTags?: readonly string[];
  readonly categories?: readonly string[];
  readonly curated?: boolean;
  readonly ownerApproved?: boolean;
  readonly now?: string;
}

function normalizeDietText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    // Eggs are inside the app's explicit ovo-lacto boundary, including eggs
    // whose package names identify the laying bird.
    .replace(/\b(?:chicken|turkey|duck|goose|geese|hen|quail|pheasant)\s+(?:s\s+)?eggs?\b/g, ' eggs ')
    // Dairy is allowed; keep the animal term available everywhere else so
    // goat meat, broth, and fat still fail closed.
    .replace(/\bgoat\s+(?:s\s+)?(cheese|milk|yogurt|yoghurt)\b/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinedMetadata(input: DietCheckInput): string {
  return normalizeDietText([input.name, ...(input.categories ?? [])].filter(Boolean).join(' '));
}

function normalizedTextContainsBlocked(value: string): boolean {
  const normalized = normalizeDietText(value);
  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}

function stripCertifiedAnalogTerms(value: string): string {
  return value.replace(ANALOGABLE_ANIMAL_TERMS, ' ').replace(/\s+/g, ' ').trim();
}

function normalizedTag(value: string): string {
  const tail = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().split(':').pop() ?? '';
  return tail.replace(/[_\s]+/g, '-').replace(/-+/g, '-');
}

function includesTag(tags: readonly string[] | undefined, values: readonly string[]): boolean {
  const normalized = new Set((tags ?? []).map(normalizedTag));
  return values.some((value) => normalized.has(value));
}

export function classifyVegetarian(input: DietCheckInput): VegetarianEligibility {
  const checkedAt = input.now ?? new Date().toISOString();
  const metadata = joinedMetadata(input);
  const ingredients = normalizeDietText(input.ingredientsText ?? '');
  const providerEvidence = includesTag(input.labels, PROVIDER_VEGETARIAN_TAGS)
    || includesTag(input.analysisTags, PROVIDER_VEGETARIAN_TAGS);
  const supportedAnalog = providerEvidence && (
    ANALOG_CUE_PATTERN.test(metadata)
    || includesTag(input.labels, CERTIFIED_ANALOG_TAGS)
    || includesTag(input.analysisTags, CERTIFIED_ANALOG_TAGS)
  );
  const metadataToCheck = supportedAnalog ? stripCertifiedAnalogTerms(metadata) : metadata;
  const providerBlocked = includesTag(input.labels, PROVIDER_BLOCKED_TAGS)
    || includesTag(input.analysisTags, PROVIDER_BLOCKED_TAGS);
  if (providerBlocked || normalizedTextContainsBlocked(ingredients) || normalizedTextContainsBlocked(metadataToCheck)) {
    return {
      status: 'blocked',
      evidence: 'ingredient-check',
      reason: 'A meat, fish, shellfish, animal-stock, gelatin, lard, or tallow signal was found.',
      checkedAt,
    };
  }
  const text = [metadata, ingredients].filter(Boolean).join(' ');
  if (input.curated) {
    return {
      status: 'allowed',
      evidence: 'curated',
      reason: 'Reviewed for the ovo-lacto vegetarian catalog.',
      checkedAt,
    };
  }
  if (input.ownerApproved) {
    return {
      status: 'allowed',
      evidence: 'owner-approved',
      reason: 'The package label was reviewed and approved on this device.',
      checkedAt,
    };
  }
  const uncertainProviderEvidence = includesTag(input.labels, PROVIDER_UNCERTAIN_TAGS)
    || includesTag(input.analysisTags, PROVIDER_UNCERTAIN_TAGS);
  if (providerEvidence && !uncertainProviderEvidence && !REVIEW_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      status: 'allowed',
      evidence: 'provider-label',
      reason: supportedAnalog
        ? PROVIDER_ANALOG_REASON
        : 'The provider marks this product vegetarian or vegan and no blocked ingredient was found.',
      checkedAt,
    };
  }
  if (input.ingredientsText && !REVIEW_PATTERNS.some((pattern) => pattern.test(text))) {
    return {
      status: 'review',
      evidence: 'ingredient-check',
      reason: 'No blocked ingredient was found, but the provider does not verify vegetarian status.',
      checkedAt,
    };
  }
  return {
    status: 'review',
    evidence: 'unknown',
    reason: 'Vegetarian status is incomplete. Check the package label before adding it.',
    checkedAt,
  };
}

export function strictestDietStatus(statuses: readonly DietStatus[]): DietStatus {
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.includes('review')) return 'review';
  return 'allowed';
}

type ProductDietFields = Pick<Product, 'eligibility' | 'name' | 'ingredientsText' | 'aliases' | 'categories'>;

export function productIsProviderCertifiedAnalog(product: Pick<Product, 'eligibility'>): boolean {
  return product.eligibility.status === 'allowed'
    && product.eligibility.evidence === 'provider-label'
    && product.eligibility.reason === PROVIDER_ANALOG_REASON;
}

function productContainsBlockedDietSignal(product: ProductDietFields): boolean {
  if (normalizedTextContainsBlocked(product.ingredientsText ?? '')) return true;
  const metadata = normalizeDietText([product.name, ...product.aliases, ...product.categories].join(' '));
  const metadataToCheck = productIsProviderCertifiedAnalog(product)
    ? stripCertifiedAnalogTerms(metadata)
    : metadata;
  return normalizedTextContainsBlocked(metadataToCheck);
}

export function productIsAllowed(product: ProductDietFields): boolean {
  return product.eligibility.status === 'allowed' && !productContainsBlockedDietSignal(product);
}

export function containsBlockedDietTerm(value: string): boolean {
  return normalizedTextContainsBlocked(value);
}

type CertifiedAnalogReference = Pick<Product, 'name' | 'eligibility'> & {
  readonly aliases?: readonly string[];
};

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Removes only exact multiword names for provider-certified analog products.
 * Bare animal words and phrases such as "chicken broth" remain blocked.
 */
export function containsBlockedDietTermOutsideCertifiedAnalogs(
  value: string,
  products: readonly CertifiedAnalogReference[],
): boolean {
  let normalized = normalizeDietText(value);
  for (const product of products.filter(productIsProviderCertifiedAnalog)) {
    for (const reference of [product.name, ...(product.aliases ?? [])]) {
      const words = normalizeDietText(reference).split(/\s+/).filter(Boolean);
      if (words.length < 2) continue;
      normalized = normalized.replace(
        new RegExp(`\\b${words.map(escapedPattern).join('\\s+')}\\b`, 'g'),
        ' tracked vegetarian product ',
      );
    }
  }
  return normalizedTextContainsBlocked(normalized);
}
