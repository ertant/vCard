var vCardParser = (function () {

    var fieldPropertyMapping = {
        "TITLE": "title",
        "TEL": "telephone",
        "FN": "displayName",
        "N": "name",
        "EMAIL": "email",
        "CATEGORIES": "categories",
        "ADR": "address",
        "URL": "url",
        "NOTE": "notes",
        "ORG": "organization",
        "BDAY": "birthday",
        "PHOTO": "photo"
    };

    function lookupField(context, fieldName) {

        var propertyName = fieldPropertyMapping[fieldName];

        if (!propertyName && fieldName !== 'BEGIN' && fieldName !== 'END') {
            context.info('define property name for ' + fieldName);
            propertyName = fieldName;
        }

        return propertyName;
    }

    function removeWeirdItemPrefix(line) {
        // sometimes lines are prefixed by "item" keyword like "item1.ADR;type=WORK:....."
        return line.substring(0, 4) === "item" ? line.match(/item\d\.(.*)/)[1] : line;
    }

    function singleLine(context, fieldValue, fieldName) {

        // convert escaped new lines to real new lines.
        fieldValue = fieldValue.replace('\\n', '\n');

        // append value if previously specified
        if (context.currentCard[fieldName]) {
            context.currentCard[fieldName] += '\n' + fieldValue;
        } else {
            context.currentCard[fieldName] = fieldValue;
        }

    }

    function typedLine(context, fieldValue, fieldName, typeInfo, valueFormatter) {

        var isDefault = false;

        // strip type info and find out is that preferred value
        typeInfo = typeInfo.filter(function (type) {
            isDefault = isDefault || type.name === 'PREF';
            return type.name !== 'PREF';
        });

        typeInfo = typeInfo.reduce(function (p, c) {
            p[c.name] = c.value;
            return p;
        }, {});

        context.currentCard[fieldName] = context.currentCard[fieldName] || [];

        context.currentCard[fieldName].push({
            isDefault: isDefault,
            valueInfo: typeInfo,
            value: valueFormatter ? valueFormatter(fieldValue) : fieldValue
        });

    }

    function commaSeparatedLine(context, fieldValue, fieldName) {
        context.currentCard[fieldName] = fieldValue.split(',');
    }

    function dateLine(context, fieldValue, fieldName) {

        // if value is in "19531015T231000Z" format strip time field and use date value.
        fieldValue = fieldValue.length === 16 ? fieldValue.substr(0, 8) : fieldValue;

        var dateValue;

        if (fieldValue.length === 8) { // "19960415" format ?
            dateValue = new Date(fieldValue.substr(0, 4), fieldValue.substr(4, 2), fieldValue.substr(6, 2));
        } else {
            // last chance to try as date.
            dateValue = new Date(fieldValue);
        }

        if (!dateValue || isNaN(dateValue.getDate())) {
            dateValue = null;
            context.error('invalid date format ' + fieldValue);
        }

        context.currentCard[fieldName] = dateValue && dateValue.toJSON(); // always return the ISO date format
    }

    function structured(fields) {

        return function (context, fieldValue, fieldName) {

            var values = fieldValue.split(';');

            context.currentCard[fieldName] = fields.reduce(function (p, c, i) {
                p[c] = values[i] || '';
                return p;
            }, {});

        }

    }

    function addressLine(context, fieldValue, fieldName, typeInfo) {

        typedLine(context, fieldValue, fieldName, typeInfo, function (value) {

            var names = value.split(';');

            return {
                // ADR field sequence
                postOfficeBox: names[0],
                number: names[1],
                street: names[2] || '',
                city: names[3] || '',
                region: names[4] || '',
                postalCode: names[5] || '',
                country: names[6] || ''
            };

        });
    }

    function noop() {
    }

    function endCard(context) {
        // store card in context and create a new card.
        context.cards.push(context.currentCard);
        context.currentCard = {};
    }

    var fieldParsers = {
        "BEGIN": noop,
        "VERSION": noop,
        "N": structured(['surname', 'name', 'additionalName', 'prefix', 'suffix']),
        "TITLE": singleLine,
        "TEL": typedLine,
        "EMAIL": typedLine,
        "ADR": addressLine,
        "NOTE": singleLine,
        "NICKNAME": commaSeparatedLine,
        "BDAY": dateLine,
        "URL": singleLine,
        "CATEGORIES": commaSeparatedLine,
        "END": endCard,
        "FN": singleLine,
        "ORG": singleLine,
        "UID": singleLine,
        "PHOTO": singleLine
    };

    function feedData(context) {

        for (var i = 0; i < context.data.length; i++) {

            var line = removeWeirdItemPrefix(context.data[i]);

            var pairs = line.split(':'),
                fieldName = pairs[0],
                fieldTypeInfo,
                fieldValue = pairs.slice(1).join(':');

            // is additional type info provided ?
            if (fieldName.indexOf(';') >= 0 && line.indexOf(';') < line.indexOf(':')) {
                var typeInfo = fieldName.split(';');
                fieldName = typeInfo[0];
                fieldTypeInfo = typeInfo.slice(1).map(function (type) {
                    var info = type.split('=');
                    return {
                        name: info[0].toLowerCase(),
                        value: info[1].replace(/"(.*)"/, '$1')
                    }
                });
            }

            // ensure fieldType is in upper case
            fieldName = fieldName.toUpperCase();

            var fieldHandler = fieldParsers[fieldName];

            if (fieldHandler) {

                fieldHandler(context, fieldValue, lookupField(context, fieldName), fieldTypeInfo);

            } else if (fieldName.substring(0, 2) != 'X-') {
                // ignore X- prefixed extension fields.
                context.info('unknown field ' + fieldName + ' with value ' + fieldValue)
            }

        }

    }

    function parse(data) {

        var lines = data
        // replace escaped new lines
            .replace(/\n\s{1}/g, '')
            // split if a character is directly after a newline
            .split(/\r\n(?=\S)|\r(?=\S)|\n(?=\S)/);

        var context = {
            info: function (desc) {
                console.info(desc);
            },
            error: function (err) {
                console.error(err);
            },
            data: lines,
            currentCard: {},
            cards: []
        };

        feedData(context);

        return context.cards;
    }

    return {
        parse: parse
    };

})();


