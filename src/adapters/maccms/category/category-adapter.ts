import { QTTab } from '@quicktvui/quicktvui3'
import { BaseAdapter } from '../core/base-adapter'
import { MacCMSCategory } from '../types'

export interface CategoryItem {
  id: string
  name: string
  enName?: string
  parentId?: number
  sort?: number
  logo?: string
  pic?: string
}

export class CategoryAdapter extends BaseAdapter<MacCMSCategory, CategoryItem> {
  adapt(source: MacCMSCategory): CategoryItem {
    return {
      id: String(source.type_id),
      name: source.type_name,
      enName: source.type_en,
      parentId: source.type_pid,
      sort: source.type_sort,
      logo: source.type_logo,
      pic: source.type_pic
    }
  }

  adaptToQTTab(categories: MacCMSCategory[]): QTTab {
    const tabs = categories.map(category => ({
      tabId: String(category.type_id),
      tabName: category.type_name,
      tabType: 0
    }))

    return {
      tabList: tabs,
      tabIndex: 0
    }
  }

  filterByParentId(categories: MacCMSCategory[], parentId: number = 0): MacCMSCategory[] {
    return categories.filter(cat => cat.type_pid === parentId)
  }

  buildCategoryTree(categories: MacCMSCategory[]): CategoryTreeNode[] {
    const categoryMap = new Map<number, CategoryTreeNode>()
    const rootNodes: CategoryTreeNode[] = []

    categories.forEach(cat => {
      categoryMap.set(cat.type_id, {
        ...this.adapt(cat),
        children: []
      })
    })

    categories.forEach(cat => {
      const node = categoryMap.get(cat.type_id)!
      if (cat.type_pid === 0) {
        rootNodes.push(node)
      } else {
        const parent = categoryMap.get(cat.type_pid)
        if (parent) {
          parent.children.push(node)
        }
      }
    })

    return rootNodes
  }
}

export interface CategoryTreeNode extends CategoryItem {
  children: CategoryTreeNode[]
}

export const categoryAdapter = new CategoryAdapter()
