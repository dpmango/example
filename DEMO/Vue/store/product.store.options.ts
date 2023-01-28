import { defineStore, acceptHMRUpdate } from 'pinia'
import { PerformanceLog } from '#imports'
import { quickFilterKeys } from '~/store/product/helpers'
import { ICategory, ICategoryFull, IProduct } from '~/interface/Product'

export const useProductStore = defineStore('product', {
  state: () => {
    return {
      catalog: [] as ICategory[] | ICategoryFull[],
      activeFilterKey: 'all',
      // categories: [],
    }
  },
  getters: {
    categoryBySlug: (state) => (slug) => {
      try {
        return state.catalog.find((x) => x.slug === slug)
      } catch {
        return null
      }
    },

    // находит категории первого уровня для использования в навигации
    navCategories(state) {
      const { $env } = useNuxtApp()

      if ($env.catalogType !== 'singlepage') {
        return state.catalog
      }

      const categoryProps = (x) => ({
        id: x.id,
        title: x.title,
        slug: x.slug,
      })

      return state.catalog.reduce((acc, category) => {
        acc.push(categoryProps(category))

        // if (category.sub_categories) {
        //   category.sub_categories.forEach((sub_category) => {
        //     acc.push(categoryProps(sub_category))
        //   })
        // }

        return acc
      }, [])
    },
    // выводит каталог с учетом действующего фильтра
    // пустые категории отфильтровываются на уровне шаблона
    catalogWithFilter(state) {
      if (!state.activeFilterKey || state.activeFilterKey === 'all') {
        return state.catalog
      }

      const DEV_perf = performance.now()

      const productFilteringFunc = (p) => p[state.activeFilterKey]

      const filteredCatalog = state.catalog.map((cat) => {
        return {
          ...cat,
          catalog_items: cat.catalog_items.filter(productFilteringFunc),
          sub_categories: cat.sub_categories.map((subcat) => ({
            ...subcat,
            catalog_items: subcat.catalog_items.filter(productFilteringFunc),
          })),
        }
      })

      PerformanceLog(DEV_perf, 'catalogWithFilter')

      return filteredCatalog
    },
    // возвращает все товары одним массивом
    // поиском по всем категориям и вложенным категориям
    flatCatalog(state): IProduct[] {
      const DEV_perf = performance.now()

      const { $env } = useNuxtApp()
      // TODO - tmp
      if ($env.catalogType !== 'singlepage') {
        return []
      }

      const flatCatalog = state.catalog.reduce((acc, x) => {
        acc = [...acc, ...x.catalog_items]
        x.sub_categories.forEach((sub) => {
          acc = [...acc, ...sub.catalog_items]
        })

        return acc
      }, [])

      PerformanceLog(DEV_perf, 'flatCatalog')

      return flatCatalog || []
    },
    // Выводит доступные категории товаров по их параметрам
    // список и порядок определяется в /product/helpers
    quickFilter() {
      const categories = [
        {
          product_key: 'all',
          label: 'Все блюда',
        },
      ]

      quickFilterKeys.forEach((filter) => {
        if (this.flatCatalog.some((x) => x[filter.product_key])) {
          categories.push({
            product_key: filter.product_key,
            label: filter.label,
          })
        }
      })

      if (categories.length === 1) {
        return {
          categories: null,
        }
      }

      return {
        categories,
      }
    },
  },
  actions: {
    async getCatalog() {
      const headers = useHeaders()
      const { $log, $env } = useNuxtApp()

      let data: ICategory[] | ICategoryFull[] = []

      if ($env.catalogType === 'singlepage') {
        data = (await useApi('catalog/get-main-page-categories', {
          method: 'GET',
          headers,
        })) as ICategoryFull[]
      } else if ($env.catalogType === 'categories') {
        data = (await useApi('catalog/get-categories', {
          method: 'GET',
          headers,
        })) as ICategory[]
      } else if ($env.catalogType === 'conceptions') {
        data = (await useApi('catalog/get-conceptions', {
          method: 'GET',
          headers,
        })) as ICategory[]
      }

      $log.log(`🧙‍♂️ ++ Catalog (type ${$env.catalogType}) set with ${data.length} categories ++ 🧙‍♂️`)

      this.catalog = [...data]

      return data
    },
  },
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useProductStore, import.meta.hot))
}
