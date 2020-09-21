import { File } from '../fileProcessing/File';
import { escapeRegExp } from '../utils/Utils';
import Binding from './Binding';
import { BindingType } from './BindingType';

import { addErrorDiagnostic } from '../utils/Feedback';

let bindingTypeTextMap = {
  onewaytarget: BindingType.oneWayTarget,
  twoway: BindingType.twoWay,
  onewaysource: BindingType.oneWaySource
};

export class XMLTag {
  constructor(xmlElement: any, tagText: string, file: File) {
    if (!xmlElement || !tagText) {
      addErrorDiagnostic(file, 9005, `Received corrupt XMLElement "${tagText}"`);
    }

    this.startPosition = xmlElement.startTagPosition;
    this.endPosition = xmlElement.endTagPosition;

    this._file = file;
    this.text = tagText;
    this.isTopTag = xmlElement.name.toLowerCase() === 'field';
    let tagLength = tagText.length;
    this.bindings = this.getBindings(xmlElement, tagText);
    // const regex = new RegExp('"@([\\(\\{\\[])+(.*)([\\)\\}\\]])+"', 'gi');
    let that = this;
    this.bindings.forEach((b) => {
      if (b.properties.type === BindingType.code) {
        const pattern = `(${b.isTopBinding ? 'value' : b.nodeField})(\\s*)=(\\s*)((?:"|'){{=${escapeRegExp(b.rawValueText)}}}(?:"|'))`;
        const regex = new RegExp(pattern, 'gim');
        that.text = that.text.replace(regex, (m, m1, m2, m3, m4) => {
          return ''.padEnd(m1.length) + m2 + m3 + ''.padEnd(m4.length + 1);
        });
      } else {
        const regex = new RegExp(`(${b.isTopBinding ? 'value' : b.nodeField})(\\s*)=(\\s*)((?:"|')${escapeRegExp(b.rawValueText)}(?:"|'))`, 'gim');
        that.text = that.text.replace(regex, (m, m1, m2, m3, m4) => {
          return ''.padEnd(m1.length) + m2 + m3 + ''.padEnd(m4.length + 1);
        });
      }
    });
    if (this.text.length < tagLength) {
      this.text = this.text.padEnd(tagLength - this.text.length);
    }
  }

  private _file: File;
  public bindings: Binding[];
  public hasBindings: boolean;
  public startPosition: number;
  public endPosition: number;
  public line: number;
  public column: number;
  public id: string;
  public text: string;
  public isTopTag: boolean;

  public getBindings(xmlElement: any, tagText: string): Binding[] {
    const staticRegex = new RegExp('^{(\\{\\:|\\{\\=)+(.*)(\\})+\\}$', 'i');
    const regex = new RegExp('^\\{([\\(\\{\\[])+(.*)([\\}\\)\\]])+\\}$', 'i');
    this.id = xmlElement.attr.id;
    const bindings = [];
    for (const attribute in xmlElement.attr) {
      if (attribute.toLowerCase() !== 'id') {
        let matches = staticRegex.exec(xmlElement.attr[attribute]);
        matches = matches || regex.exec(xmlElement.attr[attribute]);

        const bindingText = matches && matches.length > 2 ? matches[2] : null;
        const bindingStartType = matches && matches.length > 1 ? matches[1] : null;
        const bindingEndType = matches && matches.length > 3 ? matches[3] : null;

        if (bindingText) {
          let indicatedBindingMode = this.getBindingMode(bindingStartType, bindingEndType);
          const binding = new Binding();
          binding.nodeId = this.isTopTag ? 'top' : this.id;
          binding.nodeField = this.isTopTag ? this.id : attribute;
          binding.isTopBinding = this.isTopTag;

          if (binding.properties.type === BindingType.invalid) {
            binding.properties.type = indicatedBindingMode;
          }

          if (indicatedBindingMode === BindingType.code) {
            const value = xmlElement.attr[this.isTopTag ? 'value' : attribute];
            binding.rawValueText = value.substring(3, value.length - 2);
          } else {

            const parts = bindingText.split(',');
            for (let i = 0; i < parts.length; i++) {
              this.parseBindingPart(i, parts[i].replace(/\s/g, ''), binding, tagText);
            }
            binding.rawValueText = xmlElement.attr[this.isTopTag ? 'value' : attribute];

          }

          binding.validate();
          if (binding.isValid) {
            bindings.push(binding);
          } else {
            addErrorDiagnostic(this._file, 9002, `Could not parse binding for tag "${tagText}" reason: ${binding.errorMessage}`, this.line);
          }
        }
      }
    }
    this.hasBindings = bindings.length > 0;
    return bindings;
  }

  public parseBindingPart(index: number, partText: string, binding: Binding, tagText: string) {
    if (index === 0) {
      let bindingParts = partText.split('.');
      if (bindingParts.length > 1) {
        binding.observerId = bindingParts[0];
        binding.observerField = bindingParts.slice(1).join('.');
        binding.isFunctionBinding = binding.observerField.endsWith('()');
        binding.observerField = binding.observerField.replace('()', '');
      } else {
        addErrorDiagnostic(this._file, 9003,
          `Could not parse binding details for field "${partText}" from tag "${tagText}"`, this.line);
      }
    } else if (partText.toLowerCase().includes('mode=')) {
      //mode
      let mode: BindingType = bindingTypeTextMap[partText.substring(5).toLowerCase()];
      if (mode) {
        binding.properties.type = mode;
      } else {
        addErrorDiagnostic(this._file, 9004,
          `Could not parse binding mode for field "${partText}" from tag "${tagText}"`, this.line);
      }
    } else if (partText.toLowerCase().includes('transform=')) {
      //transform function
      let transformFunction = partText.substring(10);
      if (transformFunction.trim()) {
        binding.properties.transformFunction = transformFunction;
      } else {
        addErrorDiagnostic(this._file, 9006,
          `Could not parse transformFunction for field "${partText}" from tag "${tagText}"`, this.line);
      }
    } else if (partText.toLowerCase().includes('issettinginitialvalue=')) {
      //transform function
      let isSettingInitialValueText = partText.substring(22).toLowerCase();
      if (isSettingInitialValueText.trim()) {
        binding.properties.isSettingInitialValue = isSettingInitialValueText === 'true';
      } else {
        addErrorDiagnostic(this._file, 9005,
          `Could not parse isSettingInitialValueText for field "${partText}" from tag "${tagText}"`, this.line);
      }
    } else if (partText.toLowerCase().includes('isFiringOnce=')) {
      //transform function
      let isFiringOnce = partText.substring(13).toLowerCase();
      if (isFiringOnce.trim()) {
        binding.properties.isFiringOnce = isFiringOnce === 'true';
      } else {
        addErrorDiagnostic(this._file, 9006,
          `Could not parse isFiringOnce for field "${partText}" from tag "${tagText}"`, this.line);
      }
    }
  }

  private getBindingMode(bindingStartType: string, bindingEndType: string): BindingType {
    if (bindingStartType === '{' && bindingEndType === '}') {
      return BindingType.oneWaySource;
    } else if (bindingStartType === '(' && bindingEndType === ')') {
      return BindingType.oneWayTarget;
    } else if (bindingStartType === '[' && bindingEndType === ']') {
      return BindingType.twoWay;
    } else if (bindingStartType === '{:' && bindingEndType === '}') {
      return BindingType.static;
    } else if (bindingStartType === '{=' && bindingEndType === '}') {
      return BindingType.code;
    } else {
      return BindingType.invalid;
    }
  }
}
