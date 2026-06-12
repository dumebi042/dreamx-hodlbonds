/**
 *
 */
export class Queue<T> {
  private readonly items: T[]

  /**
   *
   * @param {[]} initialItems
   */
  constructor(initialItems: T[] = []) {
    this.items = initialItems
  }

  /**
   *
   * @param {*} item
   */
  push(item: T): void {
    this.items.push(item)
  }

  /**
   * @return {*}
   */
  shift(): T | undefined {
    return this.items.shift()
  }

  /**
   * @return {boolean}
   */
  isEmpty(): boolean {
    return this.items.length === 0
  }

  /**
   * @return {number}
   */
  size(): number {
    return this.items.length
  }

  /**
   *
   * @param {number} position
   * @return {*}
   */
  peek(position = 0): T | undefined {
    return this.items[position]
  }

  /**
   *
   * @param {*} item
   * @return {boolean}
   */
  remove(item: T): boolean {
    const index = this.items.indexOf(item)
    if (index !== -1) {
      this.items.splice(index, 1)
      return true
    }

    return false
  }
}
