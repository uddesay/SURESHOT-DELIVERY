import { useQuery } from '@tanstack/react-query';

import { catalogApi, categoryOptions } from '../../api/catalog';
import { peopleApi } from '../../api/people';

/** Shared reference data for catalogue filters and forms (cached across screens). */
export function useCatalogOptions({ vendors = true }: { vendors?: boolean } = {}) {
  const categories = useQuery({ queryKey: ['admin-categories'], queryFn: catalogApi.categories, staleTime: 5 * 60_000 });
  const brands = useQuery({ queryKey: ['admin-brands', 'options'], queryFn: () => catalogApi.brands({ limit: 100 }), staleTime: 5 * 60_000 });
  const vendorList = useQuery({
    queryKey: ['admin-vendors', 'options'],
    queryFn: () => peopleApi.vendors({ limit: 100, status: 'approved,suspended' }),
    staleTime: 5 * 60_000,
    enabled: vendors,
  });
  return {
    categories: categories.data ? categoryOptions(categories.data) : [],
    brands: brands.data?.items ?? [],
    vendors: vendorList.data?.items ?? [],
    loading: categories.isLoading || brands.isLoading || (vendors && vendorList.isLoading),
  };
}
