const {parse} = require('@babel/parser')
const generator = require('@babel/generator').default;
const traverse = require('@babel/traverse').default;
const types = require('@babel/types')

function Simplify_return(js_code) {
    let ast_code=parse(js_code)
    var Rerurn_sum = 5;//return��ִ�еĴ���-������ָ��Ƕ�׼��㣬�������ü���
    var delete_return = false;//returnɾ����־��
    for (var a = 1; a < Rerurn_sum; a++) {
        ast_code = parse(generator(ast_code).code);//ˢ��ast
        if (a === Rerurn_sum - 1) delete_return = true;//returnɾ����־��
        traverse(ast_code, {FunctionDeclaration: {exit: [FunToRetu]},});
    }

    function FunToRetu(path) {
        // return������
        try {
            let node = path.node;//��ȡ·���ڵ�

            if (!types.isBlockStatement(node.body)) return;//������ж�
            if (!types.isReturnStatement(node.body.body[0])) return;//return ����ж�
            let funName = node.id.name;//��������

            let retStmt = node.body.body[0];//��λ��returnStatement
            let paramsName = node.params //���������б�

            let scope = path.scope;//��ȡ·����������
            let binding = scope.getBinding(funName);//��ȡ��

            if (!binding || binding.constantViolations.length > 0) {//���ñ�����ֵ�Ƿ��޸�--һ���Լ��
                return;
            }
            let paths = binding.referencePaths;//�����õ�·��
            let paths_sums = 0;//·������

            paths.map(function (refer_path) {
                let bindpath = refer_path.parentPath;//��·��

                let binnode = bindpath.node;//��·���Ľڵ�

                if (!types.isCallExpression(binnode)) return;//�ص����ʽ�ж�

                if (!types.isIdentifier(binnode.callee)) return;//���Ǳ�ʶ�����˳�
                if (funName !== binnode.callee.name) return;//�����������ڻص������������˳�
                let args = bindpath.node.arguments;//��ȡ�ڵ�Ĳ���

                if (paramsName.length !== args.length) return;//�β���ʵ����Ŀ���ȣ��˳�
                let strA = generator(retStmt.argument).code//return ast���תjs���

                let tmpAst = parse.parse(strA);//���½���Ϊast
                for (var a = 0; a < args.length; a++) {//�������е�ʵ��
                    let name = paramsName[a].name;//�β�
                    let strB = generator(args[a]).code//ʵ��
                    traverse(tmpAst, {//�����ڲ�
                        Identifier: function (_p) {//���ñ��ʽƥ��
                            if (_p.node.name === name) {//return�е��β��봫����β�һ��
                                _p.node.name = strB;//ʵ���滻�β�
                            }
                        }
                    })
                }

                bindpath.replaceWith(t.Identifier(generator(tmpAst).code.replaceAll(';', '')))//�ӽڵ���Ϣ�滻
                paths_sums += 1;//·��+1
            });

            if (paths_sums === paths.length && delete_return) {//���󶨵�ÿ��·�����Ѵ��� �����Ƴ���ǰ·��
                path.remove();//ɾ��·��
            }
        } catch (e) {
            console.log('error')
        }

    }
    return generator(ast_code).code
}

