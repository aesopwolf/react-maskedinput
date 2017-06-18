var PropTypes = require('prop-types')
var React = require('react')
var InputMask = require('inputmask-core')

var KEYCODE_Z = 90
var KEYCODE_Y = 89

function isUndo(e) {
  return (e.ctrlKey || e.metaKey) && e.keyCode === (e.shiftKey ? KEYCODE_Y : KEYCODE_Z)
}

function isRedo(e) {
  return (e.ctrlKey || e.metaKey) && e.keyCode === (e.shiftKey ? KEYCODE_Z : KEYCODE_Y)
}

function getSelection (el) {
  var start, end, rangeEl, clone

  if (el.selectionStart !== undefined) {
    start = el.selectionStart
    end = el.selectionEnd
  }
  else {
    try {
      el.focus()
      rangeEl = el.createTextRange()
      clone = rangeEl.duplicate()

      rangeEl.moveToBookmark(document.selection.createRange().getBookmark())
      clone.setEndPoint('EndToStart', rangeEl)

      start = clone.text.length
      end = start + rangeEl.text.length
    }
    catch (e) { /* not focused or not visible */ }
  }

  return { start, end }
}

function setSelection(el, selection) {
  var rangeEl

  try {
    if (el.selectionStart !== undefined) {
      el.focus()
      el.setSelectionRange(selection.start, selection.end)
    }
    else {
      el.focus()
      rangeEl = el.createTextRange()
      rangeEl.collapse(true)
      rangeEl.moveStart('character', selection.start)
      rangeEl.moveEnd('character', selection.end - selection.start)
      rangeEl.select()
    }
  }
  catch (e) { /* not focused or not visible */ }
}

class MaskedInput extends React.Component {
  constructor(props) {
    super(props);

    this.updatePattern = this.updatePattern.bind(this);
    this.updateMaskSelection = this.updateMaskSelection.bind(this);
    this.updateInputSelection = this.updateInputSelection.bind(this);
    this.onChange = this.onChange.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyPress = this.onKeyPress.bind(this);
    this.onPaste = this.onPaste.bind(this);
    this.getDisplayValue = this.getDisplayValue.bind(this);
    this.keyPressPropName = this.keyPressPropName.bind(this);
    this.getEventHandlers = this.getEventHandlers.bind(this);
  }
  componentWillMount() {
    var options = {
      pattern: this.props.mask,
      value: this.props.value,
      formatCharacters: this.props.formatCharacters
    }
    if (this.props.placeholderChar) {
      options.placeholderChar = this.props.placeholderChar
    }
    this.mask = new InputMask(options)
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.mask !== nextProps.mask && this.props.value !== nextProps.mask) {
      // if we get a new value and a new mask at the same time
      // check if the mask.value is still the initial value
      // - if so use the nextProps value
      // - otherwise the `this.mask` has a value for us (most likely from paste action)
      if (this.mask.getValue() === this.mask.emptyValue) {
        this.mask.setPattern(nextProps.mask, {value: nextProps.value})
      }
      else {
        this.mask.setPattern(nextProps.mask, {value: this.mask.getRawValue()})
      }
    }
    else if (this.props.mask !== nextProps.mask) {
      this.mask.setPattern(nextProps.mask, {value: this.mask.getRawValue()})
    }
    else if (this.props.value !== nextProps.value) {
      this.mask.setValue(nextProps.value)
    }
  }

  componentWillUpdate(nextProps, nextState) {
    if (nextProps.mask !== this.props.mask) {
      this.updatePattern(nextProps)
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.mask !== this.props.mask && this.mask.selection.start) {
      this.updateInputSelection()
    }
  }

  updatePattern(props) {
    this.mask.setPattern(props.mask, {
      value: this.mask.getRawValue(),
      selection: getSelection(this.input)
    })
  }

  updateMaskSelection() {
    this.mask.selection = getSelection(this.input)
  }

  updateInputSelection() {
    setSelection(this.input, this.mask.selection)
  }

  onChange(e) {
    // console.log('onChange', JSON.stringify(getSelection(this.input)), e.target.value)

    var maskValue = this.mask.getValue()
    if (e.target.value !== maskValue) {
      // Cut or delete operations will have shortened the value
      if (e.target.value.length < maskValue.length) {
        var sizeDiff = maskValue.length - e.target.value.length
        this.updateMaskSelection()
        this.mask.selection.end = this.mask.selection.start + sizeDiff
        this.mask.backspace()
      }
      this.mask.setValue(e.target.value)
      var value = this.getDisplayValue()
      e.target.value = value
      if (value) {
        this.updateInputSelection()
      }
    }
    if (this.props.onChange) {
      this.props.onChange(e)
    }
  }

  onKeyDown(e) {
    // console.log('onKeyDown', JSON.stringify(getSelection(this.input)), e.key, e.target.value)

    if (isUndo(e)) {
      e.preventDefault()
      if (this.mask.undo()) {
        e.target.value = this.getDisplayValue()
        this.updateInputSelection()
        if (this.props.onChange) {
          this.props.onChange(e)
        }
      }
      return
    }
    else if (isRedo(e)) {
      e.preventDefault()
      if (this.mask.redo()) {
        e.target.value = this.getDisplayValue()
        this.updateInputSelection()
        if (this.props.onChange) {
          this.props.onChange(e)
        }
      }
      return
    }

    if (e.key === 'Backspace') {
      e.preventDefault()
      this.updateMaskSelection()
      if (this.mask.backspace()) {
        var value = this.getDisplayValue()
        e.target.value = value
        if (value) {
          this.updateInputSelection()
        }
        if (this.props.onChange) {
          this.props.onChange(e)
        }
      }
    }
  }

  onKeyPress(e) {
    // console.log('onKeyPress', JSON.stringify(getSelection(this.input)), e.key, e.target.value)

    // Ignore modified key presses
    // Ignore enter key to allow form submission
    if (e.metaKey || e.altKey || e.ctrlKey || e.key === 'Enter') { return }

    e.preventDefault()
    this.updateMaskSelection()
    if (this.mask.input((e.key || e.data))) {
      e.target.value = this.mask.getValue()
      this.updateInputSelection()
      if (this.props.onChange) {
        this.props.onChange(e)
      }
    }
  }

  onPaste(e) {
    // console.log('onPaste', JSON.stringify(getSelection(this.input)), e.clipboardData.getData('Text'), e.target.value)

    e.preventDefault()
    this.updateMaskSelection()
    // getData value needed for IE also works in FF & Chrome
    if (this.mask.paste(e.clipboardData.getData('Text'))) {
      e.target.value = this.mask.getValue()
      // Timeout needed for IE
      setTimeout(this.updateInputSelection, 0)
      if (this.props.onChange) {
        this.props.onChange(e)
      }
    }
    else {
      this.mask.setValue(e.clipboardData.getData('Text'))
      var value = this.getDisplayValue()
      e.target.value = value
      if (value) {
        this.updateInputSelection()
      }
    }
  }

  getDisplayValue() {
    var value = this.mask.getValue()
    return value === this.mask.emptyValue ? '' : value
  }

  keyPressPropName() {
    if (typeof navigator !== 'undefined') {
      return navigator.userAgent.match(/Android/i)
      ? 'onBeforeInput'
      : 'onKeyPress'
    }
    return 'onKeyPress'
  }

  getEventHandlers() {
    return {
      onChange: this.onChange,
      onKeyDown: this.onKeyDown,
      onPaste: this.onPaste,
      [this.keyPressPropName()]: this.onKeyPress
    }
  }

  focus() {
    this.input.focus()
  }

  blur() {
    this.input.blur()
  }

  render() {
    var ref = r => this.input = r
    var maxLength = this.mask.pattern.length
    var value = this.getDisplayValue()
    var eventHandlers = this.getEventHandlers()
    var { size = maxLength, placeholder = this.mask.emptyValue } = this.props

    var {placeholderChar, formatCharacters, ...cleanedProps} = this.props
    var inputProps = { ...cleanedProps, ...eventHandlers, ref, maxLength, value, size, placeholder }
    return React.createElement('input', inputProps)
  }
}

MaskedInput.propTypes = {
  mask: PropTypes.string.isRequired,
  formatCharacters: PropTypes.object,
  onChange: PropTypes.func,
  placeholderChar: PropTypes.string,
  value: PropTypes.string
}

MaskedInput.defaultProps = {
  formatCharacters: null,
  onChange: () => {},
  placeholderChar: null,
  value: ''
}

export default MaskedInput
