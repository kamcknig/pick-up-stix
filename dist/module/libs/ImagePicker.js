import DirectoryPicker from "./DirectoryPicker.js";
/**
 * Game Settings: ImagePicker
 * @href https://github.com/MrPrimate/vtta-tokenizer/blob/master/src/libs/ImagePicker.js
 */
class ImagePicker extends FilePicker {
    constructor(options = {}) {
        super(options);
    }
    _onSubmit(event) {
        event.preventDefault();
        const path = event.target.file.value;
        const activeSource = this.activeSource;
        const bucket = event.target.bucket ? event.target.bucket.value : null;
        //@ts-ignore
        this.field.value = ImagePicker.format({
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
    static Img(val) {
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
            // current = current.trim();
            const [s3, bucket] = source.split(':');
            if (bucket !== undefined) {
                return {
                    activeSource: s3,
                    bucket: bucket,
                    current: current.trim(),
                };
            }
            else {
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
                const picker = new ImagePicker({
                    field: $(element)[0],
                    //@ts-ignore
                    ...ImagePicker.parse(this.value),
                });
                // data-type="image" data-target="img"
                const pickerButton = $('<button type="button" class="file-picker" title="Pick image"><i class="fas fa-file-import fa-fw"></i></button>');
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
        $(html).find('footer button').text('Select Image');
    }
}
// eslint-disable-next-line no-unused-vars
Hooks.on('renderSettingsConfig', (app, html, user) => {
    ImagePicker.processHtml(html);
});
export default ImagePicker;
