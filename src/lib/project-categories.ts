/** Projects categories, in the order of the filter buttons and the groups on the page. */
export const projectCategories = ['Tools', 'Apps', 'Products', 'Plugins', 'Experiments'] as const;
export type ProjectCategory = (typeof projectCategories)[number];
