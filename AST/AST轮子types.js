const types = require('@babel/types');

/* �жϽڵ��Ƿ�Ϊ������ */
function is_literal(node) {
    if (types.isLiteral(node)) {
        return true;
    }
    else if (types.isUnaryExpression(node, { 'operator': '+' }) || types.isUnaryExpression(node, { 'operator': '-' })) {
        return is_literal(node.argument);
    }
    return false
}

/* ��ԭ��ֱ�۵ı����ַ�������ֵ */
const visual_literal =
{
    NumericLiteral(path) {
        let node = path.node;
        if (node.extra && /^0[obx]/i.test(node.extra.raw)) {
            node.extra = undefined;
        }
    },
    StringLiteral(path) {
        let node = path.node;
        if (node.extra && /\\[ux]/gi.test(node.extra.raw)) {
            try {
                node_value = decodeURIComponent(escape(node.value));
            } catch (error) {
                node_value = node.value;
            };
            path.replaceWith(types.stringLiteral(node_value));
            path.node.extra = { 'raw': JSON.stringify(node_value), 'rawValue': node_value };
        }
    }
}

/* �滻����ԭ�� var,let,const �����δ����������� */
const visual_var_literal =
{
    VariableDeclarator(path) {
        const { id, init } = path.node;
        let binding = path.scope.getBinding(id.name);

        // ֻ�������������ұ��޸���������
        if (!types.isLiteral(init) || !binding.constant) {
            return;
        }
        for (let refer_path of binding.referencePaths) {
            refer_path.replaceWith(init);
        }
        path.remove();
        // �ֶ����� scope ����ֹӰ���¸����ʹ��
        path.scope.crawl();
    }
}


/*
 ����![]��!![] �� �򵥵������������� 1+2+3
 �ղ����ʹ�� exit ��ʽ����
 */
const simple_calc = {
    UnaryExpression: {
        exit(path) {
            let old_code = path.toString();
            let allow_array = ['!', 'typeof']
            let { operator } = path.node;
            if (!allow_array.includes(operator)) {
                return;
            }
            let { confident, value } = path.evaluate();
            if (!confident) {
                return;
            }
            path.replaceWith(types.valueToNode(value));
            console.log(old_code + ' => ' + path.toString());
            path.scope.crawl();
        }
    },
    BinaryExpression: {
        exit(path) {
            let old_code = path.toString();
            let invalid_identifier_array = ['undefined', 'Infinity', 'NaN'];
            let { left, right } = path.node;
            if (!types.isLiteral(left) && !types.isUnaryExpression(left)) {
                if (types.isIdentifier(left) || invalid_identifier_array.includes(left.name)) {
                }
                else if (types.isCallExpression(left) && global[left.callee.name]) {
                }
                else {
                    return;
                }
            }
            if (!types.isLiteral(right) && !types.isUnaryExpression(right)) {
                if (types.isIdentifier(right) || invalid_identifier_array.includes(right.name)) {
                }
                else if (types.isCallExpression(right) && global[right.callee.name]) {
                }
                else {
                    return;
                }
            }

            let { confident, value } = path.evaluate();
            if (!confident) {
                return;
            }
            let invalid_value_array = [undefined, null, Infinity, -Infinity, NaN];
            if (invalid_value_array.includes(value)) {
                path.replaceWithSourceString(value);
                console.log(old_code + ' => ' + path.toString());
            }
            else {
                path.replaceWith(types.valueToNode(value));
                if (path.isStringLiteral()){
                    path.node.extra = { 'raw': JSON.stringify(value), 'rawValue': value };
                }
                console.log(old_code + ' => ' + path.toString());
            }
            path.scope.crawl();
        }
    }
}

/* ��������ʽ������䣬�� var a=b(function xxx);var c=b;... */
const multiple_define =
{
    VariableDeclarator(path) {
        let { id, init } = path.node;
        if (!types.isIdentifier(id) || !types.isIdentifier(init)) {
            return;
        }
        let init_identifier = path.scope.getBinding(init.name).identifier;
        let id_refer_paths = path.scope.getBinding(id.name).referencePaths;
        for (let refer_path of id_refer_paths) {
            refer_path.replaceWith(init_identifier);
        }
        path.remove();
        // �ֶ����� scope ����ֹӰ���¸����ʹ��
        path.scope.crawl();
    }
}

/* �� a['bb'] ת��Ϊ a.bb */
const to_dot_form = {
    MemberExpression(path) {
        let { computed } = path.node;
        // ��ȡ path property ��·��
        let property = path.get('property');
        if (computed && types.isStringLiteral(property)) {
            property.replaceWith(types.identifier(property.node.value));
            path.node.computed = false;
        }
        path.scope.crawl();
    }
}

/* ɾ������ȷ���� if �жϻ��������ʽ��δʹ�õķ�֧���� */
const rm_unused_branch =
{
    IfStatement(path) {
        let consequent_path = path.get('consequent');
        let alternate_path = path.get('alternate');
        let test_path = path.get('test');
        if (!types.isBlockStatement(consequent_path)) {
            consequent_path.replaceWith(types.blockStatement([consequent_path]));
        }

        if (alternate_path.toString() && !types.isBlockStatement(alternate_path)) {
            alternate_path.replaceWith(types.blockStatement([alternate_path]));
        }

        let replace_path;
        let { confident, value } = test_path.evaluate();
        if (!confident) {
            return;
        }
        if (value) {
            replace_path = consequent_path;
        }
        else {
            if (!alternate_path.toString()) {
                path.remove();
                path.scope.crawl();
                return
            }
            replace_path = alternate_path;

        }
        for (let statement of replace_path.node.body) {
            if (types.isVariableDeclaration(statement) && statement.kind !== 'var') {
                return;
            }
        }
        path.replaceWithMultiple(replace_path.node.body);
        path.scope.crawl();
    },
    ConditionalExpression(path) {
        let consequent_path = path.get('consequent');
        let alternate_path = path.get('alternate');
        let test_path = path.get('test');

        let { confident, value } = test_path.evaluate();
        if (!confident) {
            return;
        }

        if (value) {
            path.replaceWith(consequent_path);
        }
        else {
            path.replaceWith(alternate_path);
        }
        path.scope.crawl();
    }
}

/*  ɾ��δ��ʹ�õ� function ���� var,let,const �����δʹ�ñ���������� */
const rm_unused_code =
{
    VariableDeclarator(path) {
        const { id } = path.node;
        let binding = path.scope.getBinding(id.name);

        if (binding.referenced) {
            return;
        }
        path.remove();
        path.scope.crawl();
    },
    FunctionDeclaration(path) {
        const { id } = path.node;
        // ��ֹ�����д��ڱ����뺯������ͬ���Ҹñ����ں�����ʹ�ã�����δȥ��δʹ�ú���
        let binding = path.scope.parent.getBinding(id.name);

        if (binding.referenced) {
            return;
        }
        path.remove();
        // �ֶ����� scope ����ֹӰ���¸����ʹ��
        path.scope.crawl();
    },
    'EmptyStatement'(path) {
        path.remove();
    }
}

exports.is_literal = is_literal;
exports.visual_literal = visual_literal;
exports.visual_var_literal = visual_var_literal;
exports.to_dot_form = to_dot_form;
exports.rm_unused_branch = rm_unused_branch;
exports.rm_unused_code = rm_unused_code;
exports.simple_calc = simple_calc;
exports.multiple_define = multiple_define;