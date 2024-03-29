import { ViewingDirection } from '@iiif/presentation-3';
import { AbstractObject } from '../../world-objects/abstract-object';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';

export class GridBuilder {
  autoWidth = false;
  autoHeight = true;
  width: number;
  height: number;

  world: World;
  content: WorldObject[] = [];
  viewingDirection: ViewingDirection = 'left-to-right';
  rows?: number;
  columns?: number = 4;
  spacing = 20;
  reversed = false;
  padding = 20;

  constructor() {
    this.world = World.withProps({ width: 0, height: 0, viewingDirection: 'left-to-right' });
    this.width = 0;
    this.height = 0;
  }

  setViewingDirection(viewingDirection: ViewingDirection) {
    this.viewingDirection = viewingDirection;
  }

  addContent(content: AbstractObject[]) {
    this.content.push(
      ...content.map((item) =>
        this.world.addObjectAt(item, {
          width: 0,
          height: 0,
          x: 0,
          y: 0,
        })
      )
    );
  }

  setWidth(width: number) {
    this.width = width;
  }

  setHeight(height: number) {
    this.height = height;
  }

  setSpacing(spacing: number) {
    this.spacing = spacing;
  }

  setPadding(padding: number) {
    this.padding = padding;
  }

  setRows(rows?: number) {
    this.autoWidth = true;
    this.rows = rows;
  }

  setColumns(columns?: number) {
    this.autoHeight = true;
    this.columns = columns;
  }

  recalculate() {
    if (this.height === 0 && this.width === 0) {
      // Nothing to render if its 0 width.
      return;
    }

    if (this.rows === 0 || this.columns === 0) {
      // No columns or rows.
      return;
    }

    if (this.autoHeight && !this.width) {
      throw new Error('Cannot set auto height without setting a width');
    }

    if (this.autoWidth && !this.height) {
      throw new Error('Cannot set auto width without setting a height');
    }

    if ((this.viewingDirection === 'left-to-right' || this.viewingDirection === 'top-to-bottom') && this.reversed) {
      this.reversed = false;
      this.content.reverse();
    }
    if ((this.viewingDirection === 'right-to-left' || this.viewingDirection === 'bottom-to-top') && !this.reversed) {
      this.reversed = true;
      this.content.reverse();
    }

    const len = this.content.length;

    const getColumns = () => {
      if (this.autoWidth && this.rows) {
        const rowsValue = len > this.rows ? this.rows : len;
        return {
          columns: Math.ceil(len / (rowsValue as number)),
          rows: rowsValue,
        };
      }

      if (this.autoHeight && this.columns) {
        const columnsValue = len > this.columns ? this.columns : len;
        return {
          columns: columnsValue,
          rows: Math.ceil(len / (columnsValue as number)),
        };
      }

      throw new Error('Something went wrong.');
    };

    const { columns, rows } = getColumns();
    const contentWidth = this.autoWidth ? -1 : this.width - this.padding * 2;
    // const contentHeight = this.autoHeight ? -1 : this.height - this.padding / 2;
    const itemWidth = this.autoWidth ? -1 : (contentWidth - this.spacing * (columns - 1)) / columns;
    // const itemHeight = this.autoHeight ? -1 : (contentWidth - this.spacing * (columns - 1)) / rows;

    // do rows then columns
    if (this.autoHeight && !this.autoWidth) {
      let index = 0;
      let rowHeights = this.padding;
      for (let r = 0; r < rows; r++) {
        if (index === len) {
          break;
        }
        let rowHeight = 0;
        const row = [];
        for (let c = 0; c < columns; c++) {
          const realIndex = this.reversed ? len - index : index;
          if (index === len) {
            break;
          }
          const item = this.content[realIndex];
          const width = item.width;
          const aspectRatio = item.width / item.height;
          const currentRowHeight = itemWidth / aspectRatio;
          row.push([
            index,
            itemWidth, // width
            currentRowHeight, // height
            itemWidth / width, // scale
          ]);
          if (currentRowHeight > rowHeight) {
            rowHeight = currentRowHeight;
          }
          index++;
        }
        // Back through the rows.
        for (let c = 0; c < columns; c++) {
          if (!row[c]) {
            break;
          }
          const worldPoints = this.world.getPoints();
          const currentIndex = row[c][0];
          const width = row[c][1];
          const height = row[c][2];
          const scale = row[c][3];
          const x = this.padding + c * (this.spacing + width);
          const y = rowHeights + (rowHeight - height) / 2;
          const realIndex = this.reversed ? len - currentIndex : currentIndex;
          const prevX = worldPoints[realIndex * 5 + 1];
          const prevY = worldPoints[realIndex * 5 + 2];

          this.world.scaleWorldObject(currentIndex, scale);
          if (prevX !== x || prevY !== y) {
            this.world.translateWorldObject(realIndex, x - prevX, y - prevY);
          }
        }
        // Add the current row to the total row heights
        rowHeights += rowHeight + this.spacing;
      }
      this.height = rowHeights + this.padding;
      this.world.resize(this.width, this.height);
      return;
    }

    // do columns then rows
    if (this.autoWidth && !this.autoHeight) {
      // @todo
    }

    // Fixed height and width, fit content
    if (!this.autoWidth && !this.autoHeight) {
      // @todo
    }
  }

  getWorld(): World {
    return this.world;
  }
}
