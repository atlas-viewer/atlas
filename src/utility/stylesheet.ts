import { hash } from './hash';

export class Stylesheet {
  $element: HTMLStyleElement;
  stylesheetClasses: string[];
  activeStylesheetClasses: string[];
  sheetsDidUpdate: boolean;
  sheetPrefix: string;
  stylesheetEntries: Record<string, string>;

  constructor(options?: { sheetPrefix?: string }) {
    this.sheetPrefix = options?.sheetPrefix || 'a-';
    this.$element = document.createElement('style');
    this.stylesheetClasses = [];
    this.activeStylesheetClasses = [];
    this.sheetsDidUpdate = false;
    this.stylesheetEntries = {};
  }

  getElement() {
    return this.$element;
  }

  addStylesheet(_sheet: string) {
    const sheet = _sheet.replace(/\s\s+/g, ' ').replace(/: /g, ':').replace(/; /g, ';').trim();
    const className = this.sheetPrefix + hash(sheet, true);
    if (this.stylesheetClasses.indexOf(className) !== -1) {
      return className;
    }
    this.stylesheetClasses.push(className);
    this.activeStylesheetClasses.push(className);
    this.stylesheetEntries[className] = sheet;
    this.sheetsDidUpdate = true;
    return className;
  }

  removeStylesheet(obj: any) {
    const className = this.sheetPrefix + hash(obj, true);
    if (this.stylesheetClasses.indexOf(className)) {
      this.stylesheetClasses = this.stylesheetClasses.filter((t) => t !== className);
    }
    this.sheetsDidUpdate = true;
  }

  clearClasses() {
    this.activeStylesheetClasses = [];
  }

  didUpdateActive() {
    if (this.activeStylesheetClasses.length) {
      for (const sheet of this.activeStylesheetClasses) {
        if (this.stylesheetClasses.indexOf(sheet) === -1) {
          return true;
        }
      }
      for (const sheet of this.stylesheetClasses) {
        if (this.activeStylesheetClasses.indexOf(sheet) === -1) {
          return true;
        }
      }
    }

    return false;
  }

  updateSheet() {
    if (this.sheetsDidUpdate || this.didUpdateActive()) {
      this.$element.innerText = this.activeStylesheetClasses
        .map((className) => `.${className}{${this.stylesheetEntries[className]}}`)
        .join('');
      this.sheetsDidUpdate = false;
      this.stylesheetClasses = [...this.activeStylesheetClasses];
    }
  }
}
