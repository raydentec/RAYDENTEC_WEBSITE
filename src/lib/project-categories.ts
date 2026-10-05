/**
 * Projects categories with their `order`: the groups on the page and the filter buttons
 * appear in ascending order (filtering only hides groups, so the rest keep it). Currently
 * numbered alphabetically.
 */
export const projectCategoryOrder = {
  Apps: 1,
  Experiments: 2,
  Plugins: 3,
  Products: 4,
  Tools: 5,
} as const;

export type ProjectCategory = keyof typeof projectCategoryOrder;

/** Category names, for the content schema (any order). */
export const projectCategoryNames = Object.keys(projectCategoryOrder) as [ProjectCategory, ...ProjectCategory[]];

/** Category names by `order`. */
export const projectCategories: ProjectCategory[] = [...projectCategoryNames].sort(
  (a, b) => projectCategoryOrder[a] - projectCategoryOrder[b],
);
