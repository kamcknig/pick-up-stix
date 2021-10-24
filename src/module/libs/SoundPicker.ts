import DirectoryPicker from './DirectoryPicker';

/**
 * Game Settings: SoundPicker
 * @href https://github.com/MrPrimate/vtta-tokenizer/blob/master/src/libs/SoundPicker.js
 */
class SoundPicker extends FilePicker {
  constructor(options = {}) {
    super(options);
  }

  _onSubmit(event) {
    event.preventDefault();
    const path = event.target.file.value;
    const activeSource = this.activeSource;
    const bucket = event.target.bucket ? event.target.bucket.value : null;
    //@ts-ignore
    this.field.value = SoundPicker.format({
      activeSource,
      bucket,
      path,
    });
    this.close();
  }

  static async uploadToPath(path, file) {
    const options = DirectoryPicker.parse(path);
    return FilePicker.upload(options.activeSource, options.current, file, { bucket: options.bucket });
  }

  // returns the type "Img" for rendering the SettingsConfig
  static Sound(val) {
    return val === null ? '' : String(val);
  }

  // formats the data into a string for saving it as a GameSetting
  static format(value) {
    return value.bucket !== null
      ? `[${value.activeSource}:${value.bucket}] ${value.path}`
      : `[${value.activeSource}] ${value.path}`;
  }

  // parses the string back to something the FilePicker can understand as an option
  static parse(inStr) {
    const str = inStr ?? '';
    const matches = str.match(/\[(.+)\]\s*(.+)?/u);
    if (matches) {
      const [, source, current = ''] = matches;
      //current = current.trim();
      const [s3, bucket] = source.split(':');
      if (bucket !== undefined) {
        return {
          activeSource: s3,
          bucket: bucket,
          current: current.trim(),
        };
      } else {
        return {
          activeSource: s3,
          bucket: null,
          current: current.trim(),
        };
      }
    }
    // failsave, try it at least
    return {
      activeSource: 'data',
      bucket: null,
      current: str,
    };
  }

  // Adds a FilePicker-Simulator-Button next to the input fields
  static processHtml(html) {
    $(html)
      .find(`input[data-dtype="Img"]`)
      .each((index, element) => {
        $(element).prop('readonly', true);

        if (!$(element).next().length) {
          const picker = new SoundPicker({
            field: $(element)[0],
            //@ts-ignore
            ...SoundPicker.parse(this.value),
          });
          // data-type="sound" data-target="sound"
          const pickerButton = $(
            '<button type="button" class="file-picker" title="Pick sound"><i class="fas fa-file-import fa-fw"></i></button>',
          );
          pickerButton.on('click', () => {
            picker.render(true);
          });
          $(element).parent().append(pickerButton);
        }
      });
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // remove unnecessary elements
    $(html).find('footer button').text('Select sound');
  }
}

// eslint-disable-next-line no-unused-vars
Hooks.on('renderSettingsConfig', (app, html, user) => {
  SoundPicker.processHtml(html);
});

export default SoundPicker;
